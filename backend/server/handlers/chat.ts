import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { ProviderConfigError } from '../../../contracts/errors'
import type { ChatMessage as WireMessage, ChatStreamEvent } from '../../../contracts/chat'
import { METHODS } from '../../../contracts/methods'
import { abortRequest, beginRequest, endRequest } from '../../chat/inflight'
import { fitContext, measureContext } from '../../chat/fitContext'
import type { TranscriptMessage } from '../../chat/transcript'
import { withSystemPrompt } from '../../chat/systemPrompt'
import { runToolLoop } from '../../chat/toolLoop'
import { wireTranscript, providerHistory } from '../../chat/history'
import { toolDefinitions } from '../../tools/registry'
import type { ChatImage, ChatMessage, ChatStreamEvent as ProviderStreamEvent } from '../../providers/types'
import { processImage } from '../../tools/image'
import { resolveApiKey } from '../../providers/credentials'
import { findDescriptor } from '../../providers/descriptors'
import { createOpenCodeProvider } from '../../providers/opencode'
import type {
  ChatStopReason,
  Provider,
} from '../../providers/types'
import type { ResolvedCompactionSettings, SummarizationCall } from '../../compaction'

/**
 * Chat handlers.
 *
 * The provider key is resolved here and never travels to the renderer. A failure
 * is returned as a typed error so the UI can show the reason rather than a blank
 * reply.
 */

function asProviderError(error: unknown): ProviderConfigError {
  return new ProviderConfigError({ message: error instanceof Error ? error.message : String(error) })
}

function buildProvider(providerId: string, apiKey: string): Provider | undefined {
  if (providerId === 'opencode-go') return createOpenCodeProvider({ apiKey })
  return undefined
}

/** Everything needed to talk to a provider, or the reason we cannot. */
function resolveProvider(providerId: string): { provider: Provider; error: null } | { provider: null; error: string } {
  const descriptor = findDescriptor(providerId)
  if (descriptor === undefined) return { provider: null, error: 'Unknown provider: ' + providerId }

  const apiKey = resolveApiKey(providerId)
  if (apiKey === undefined) return { provider: null, error: 'No API key configured for ' + descriptor.name }

  const provider = buildProvider(providerId, apiKey)
  if (provider === undefined) return { provider: null, error: 'Unknown provider: ' + providerId }

  return { provider, error: null }
}

/** Recent turns kept verbatim after a checkpoint. */
const KEEP_RECENT_TOKENS = 20000

/**
 * The share of the window held back, which is what sets the trigger point.
 *
 * Compaction fires when the transcript passes the window minus this, so a tenth
 * means it fires at ninety per cent full. Expressed as a share rather than a
 * fixed number because a fixed one means something different on every model.
 */
const RESERVE_SHARE = 0.1

function compactionSettings(contextWindow: number): ResolvedCompactionSettings {
  return {
    enabled: true,
    reserveTokens: Math.round(contextWindow * RESERVE_SHARE),
    keepRecentTokens: KEEP_RECENT_TOKENS
  }
}

function asStopReason(reason: ChatStopReason): 'stop' | 'length' | 'error' | 'aborted' {
  if (reason === 'length' || reason === 'aborted' || reason === 'error') return reason
  return 'stop'
}

/**
 * One summarization round trip over the same provider the turn uses.
 *
 * The summary is asked for at a lower ceiling than the answer, because it is a
 * compression task and there is no reader waiting on its prose.
 */
function summarizationCallFor(
  provider: Provider,
  providerId: string,
  model: string,
  signal: AbortSignal | undefined
): SummarizationCall {
  return async (request) => {
    const result = await provider.chat({
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.text }
      ],
      maxTokens: request.maxTokens,
      ...(request.sessionId !== undefined ? { sessionId: request.sessionId } : {}),
      ...(signal !== undefined ? { signal } : {})
    })

    return {
      role: 'assistant',
      content: [{ type: 'text', text: result.text }],
      api: 'chat',
      provider: providerId,
      model,
      usage: {
        input: Math.floor(result.usage.input),
        output: Math.floor(result.usage.output),
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: Math.floor(result.usage.total),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      },
      stopReason: asStopReason(result.stopReason),
      timestamp: Date.now()
    }
  }
}

/**
 * The turns to actually send, once the transcript has been measured.
 *
 * An unknown context window sends the transcript untouched. Trimming against a
 * guessed budget would drop history the model could have taken, and the guess
 * would be wrong in the direction that loses the reader's conversation.
 */
async function fitRequest(
  provider: Provider,
  providerId: string,
  payload: {
    model: string
    messages: readonly WireMessage[]
    sessionId?: string
  },
  signal: AbortSignal | undefined
): Promise<{
  messages: readonly TranscriptMessage[]
  contextWindow: number | undefined
  compacted: boolean
  tokensBefore: number
  tokensAfter: number
  summary?: string
  firstKeptId?: string
}> {
  const transcript = wireTranscript(payload.messages)

  let contextWindow: number
  try {
    contextWindow = await provider.contextWindowFor(payload.model)
  } catch {
    return {
      messages: transcript,
      contextWindow: undefined,
      compacted: false,
      tokensBefore: 0,
      tokensAfter: 0
    }
  }

  const fitted = await fitContext({
    messages: transcript,
    contextWindow,
    settings: compactionSettings(contextWindow),
    call: summarizationCallFor(provider, providerId, payload.model, signal),
    ...(payload.sessionId !== undefined ? { sessionId: payload.sessionId } : {})
  })

  return {
    messages: await normalizeImages(fitted.messages),
    contextWindow,
    compacted: fitted.compacted,
    tokensBefore: fitted.tokensBefore,
    tokensAfter: fitted.tokensAfter,
    summary: fitted.summary,
    firstKeptId: fitted.firstKeptId
  }
}

/** Formats a provider takes as they are. */
const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** Ceiling on the base64 payload, matching what the tool side enforces. */
const MAX_IMAGE_BASE64_BYTES = 4.5 * 1024 * 1024

/**
 * Normalise every image in a transcript, not only the ones just added.
 *
 * A turn is re-sent whole on every request, so an image that arrived oversized
 * would be re-sent oversized on every later turn and fail all of them rather
 * than just the one it was attached to. Doing this per request is the point at
 * which history is covered as well as the new turn.
 *
 * A supported format already under the size limit is passed through untouched,
 * which is the ordinary case and costs nothing. Anything else goes through the
 * same ladder a tool read uses, so there is one resize and it is the tested
 * one.
 */
async function normalizeImages(messages: readonly TranscriptMessage[]): Promise<TranscriptMessage[]> {
  const out: TranscriptMessage[] = []

  for (const message of messages) {
    const images = message.images
    if (images === undefined || images.length === 0) {
      out.push(message)
      continue
    }

    const kept: ChatImage[] = []
    let dropped = 0

    for (const image of images) {
      if (INLINE_IMAGE_TYPES.has(image.mimeType) && image.data.length < MAX_IMAGE_BASE64_BYTES) {
        kept.push(image)
        continue
      }
      const processed = await processImage(Buffer.from(image.data, 'base64'), image.mimeType)
      if (processed.ok) {
        kept.push({ mimeType: processed.mimeType, data: processed.data })
      } else {
        dropped += 1
      }
    }

    // An image that cannot be read is said out loud rather than dropped.
    // Losing it silently leaves the model answering a question about something
    // it was never shown, with nothing on screen explaining why.
    if (dropped > 0) {
      const note =
        dropped === 1
          ? '[An attached image could not be read and was not sent.]'
          : '[' + String(dropped) + ' attached images could not be read and were not sent.]'
      const content = message.content === '' ? note : message.content + '\n\n' + note
      out.push(
        kept.length === 0
          ? { ...message, content, images: undefined }
          : { ...message, content, images: kept }
      )
      continue
    }

    out.push({ ...message, images: kept })
  }

  return out
}

export function chatHandlers() {
  return {
    // Streaming. A failure is delivered as an event rather than failing the
    // stream, so text already rendered is not thrown away by a late error.
    [METHODS.stream]: (payload: {
      providerId: string
      model: string
      messages: readonly WireMessage[]
      maxTokens?: number
      thinkingLevel?: string
      sessionId?: string
      requestId?: string
      workingDirectory?: string
    }) => {
      const resolved = resolveProvider(payload.providerId)

      // One generator either way, so both paths produce the same stream type.
      const events = (async function* (): AsyncGenerator<ChatStreamEvent> {
        if (resolved.provider === null) {
          yield { type: 'error', message: resolved.error }
          return
        }

        // Registered before the first byte is asked for, so a cancel that
        // arrives while the connection is still opening finds something to
        // abort rather than nothing.
        const controller = payload.requestId === undefined ? null : beginRequest(payload.requestId)

        try {
          const fitted = await fitRequest(
            resolved.provider,
            payload.providerId,
            payload,
            controller?.signal
          )

          const provider = resolved.provider
          const workingDirectory = payload.workingDirectory

          // Two things have to hold before a tool is offered at all. There has
          // to be a directory, because a relative path has nothing to resolve
          // against and a write with no root could land anywhere. And the model
          // has to accept tools, because offering them to one that does not
          // fails the request rather than being ignored.
          const canCallTools = await provider.supportsToolCalls(payload.model)
          const acceptsImages = await provider.supportsImages(payload.model)
          const tools =
            workingDirectory === undefined || !canCallTools ? undefined : toolDefinitions()

          const history = providerHistory(fitted.messages)

          // The budget a round must stay under. Undefined when the model's
          // window is unknown, in which case growth is not guessed at.
          const budget =
            fitted.contextWindow === undefined
              ? undefined
              : fitted.contextWindow - Math.round(fitted.contextWindow * RESERVE_SHARE)

          const streamRound = async function* (round: ChatMessage[]): AsyncGenerator<ProviderStreamEvent> {
            const prepared = withSystemPrompt(round, workingDirectory)

            // Checked before the request rather than after it fails. A round
            // that grew past the window would otherwise be rejected by the
            // vendor with a message about tokens that says nothing about which
            // tool call produced the giant result.
            if (budget !== undefined) {
              const used = measureContext(
                prepared.map((message, index) => ({ ...message, id: 'round-' + index }))
              )
              if (used > budget) {
                yield {
                  type: 'error',
                  message:
                    'This turn asked for more context than the model can hold (' +
                    String(used) +
                    ' tokens against a ' +
                    String(fitted.contextWindow ?? 0) +
                    ' token window), so it stopped here. The work so far is above. Ask again to continue with what has been done.',
                }
                yield { type: 'done', stopReason: 'length' }
                return
              }
            }

            for await (const event of provider.streamChat({
              model: payload.model,
              messages: prepared,
              ...(payload.maxTokens !== undefined ? { maxTokens: payload.maxTokens } : {}),
              ...(payload.thinkingLevel !== undefined ? { reasoningEffort: payload.thinkingLevel } : {}),
              ...(payload.sessionId !== undefined ? { sessionId: payload.sessionId } : {}),
              ...(controller !== null ? { signal: controller.signal } : {}),
              ...(tools === undefined ? {} : { tools }),
            })) {
              yield event
            }
          }

          // Reported before the first token, because it happened before the
          // first token. The reader sees why the context shrank as it happens
          // rather than only noticing the model forgot something.
          if (fitted.compacted === true) {
            yield {
              type: 'compacted',
              tokensBefore: fitted.tokensBefore,
              tokensAfter: fitted.tokensAfter,
              summary: fitted.summary,
              firstKeptMessageId: fitted.firstKeptId
            }
          }

          // The window is known here and not to the provider, so it is attached
          // on the way past rather than reported separately and stitched
          // together by the caller.
          for await (const event of runToolLoop({
            messages: history,
            cwd: workingDirectory ?? '',
            stream: streamRound,
            acceptsImages,
            ...(controller !== null ? { signal: controller.signal } : {}),
          })) {
            if (event.type === 'done' && fitted.contextWindow !== undefined) {
              yield { ...event, contextWindow: fitted.contextWindow }
              continue
            }
            yield event
          }
        } finally {
          // Released whether it finished, failed, or was aborted, so a finished
          // turn does not linger in the registry.
          if (payload.requestId !== undefined && controller !== null) {
            endRequest(payload.requestId, controller)
          }
        }
      })()

      // The generator reports failures as events, so a throw escaping it is a
      // bug rather than an expected error. It defects instead of widening the
      // stream's error channel, which the contract declares as never.
      return Stream.fromAsyncIterable(events, (error: unknown): never => {
        throw error
      })
    },

    // Forces a checkpoint now, and hands back what should replace the older
    // turns. The caller owns its transcript, so it gets the pieces rather than a
    // rewritten history it never asked for.
    [METHODS.compact]: (payload: {
      providerId: string
      model: string
      messages: readonly WireMessage[]
      sessionId?: string
    }) =>
      Effect.tryPromise({
        try: async () => {
          const descriptor = findDescriptor(payload.providerId)
          if (descriptor === undefined) throw new Error('Unknown provider: ' + payload.providerId)

          const apiKey = resolveApiKey(payload.providerId)
          if (apiKey === undefined) {
            throw new Error('No API key configured for ' + descriptor.name)
          }

          const provider = buildProvider(payload.providerId, apiKey)
          if (provider === undefined) throw new Error('Unknown provider: ' + payload.providerId)

          const transcript = wireTranscript(payload.messages)

          const nothing = {
            compacted: false,
            summary: '',
            firstKeptMessageId: '',
            tokensBefore: 0,
            tokensAfter: 0
          }

          let contextWindow: number
          try {
            contextWindow = await provider.contextWindowFor(payload.model)
          } catch {
            return nothing
          }

          const fitted = await fitContext({
            messages: transcript,
            contextWindow,
            call: summarizationCallFor(provider, payload.providerId, payload.model, undefined),
            // The same settings the automatic path uses. What differs is that
            // nothing here consults the context window, so a manual checkpoint
            // runs whenever there is something to fold up, not only when the
            // transcript is nearly full. Inventing a smaller keep window for
            // this path would mean a manual compact summarised history the
            // automatic one deliberately preserves.
            settings: compactionSettings(contextWindow),
            force: true,
            ...(payload.sessionId !== undefined ? { sessionId: payload.sessionId } : {})
          })

          if (!fitted.compacted) return nothing

          return {
            compacted: true,
            summary: fitted.summary ?? '',
            firstKeptMessageId: fitted.firstKeptId ?? '',
            tokensBefore: fitted.tokensBefore,
            tokensAfter: fitted.tokensAfter
          }
        },
        catch: asProviderError
      }),

    // Measures the transcript as it stands, without sending anything. The
    // window is read here because only the provider layer knows it, and a
    // gauge without a denominator is not worth drawing.
    [METHODS.contextUsage]: (payload: {
      providerId: string
      model: string
      messages: readonly WireMessage[]
    }) =>
      Effect.tryPromise({
        try: async () => {
          const descriptor = findDescriptor(payload.providerId)
          if (descriptor === undefined) throw new Error('Unknown provider: ' + payload.providerId)

          const apiKey = resolveApiKey(payload.providerId)
          if (apiKey === undefined) {
            throw new Error('No API key configured for ' + descriptor.name)
          }

          const provider = buildProvider(payload.providerId, apiKey)
          if (provider === undefined) throw new Error('Unknown provider: ' + payload.providerId)

          const transcript = wireTranscript(payload.messages)

          const tokens = measureContext(transcript)

          let contextWindow: number | null = null
          try {
            contextWindow = await provider.contextWindowFor(payload.model)
          } catch {
            contextWindow = null
          }

          return { tokens, contextWindow }
        },
        catch: asProviderError
      }),

    // Reports whether anything was found. A turn that finished a moment ago is
    // not an error: the click landed on a reply that had already ended.
    [METHODS.cancel]: (payload: { requestId: string }) =>
      Effect.sync(() => ({ cancelled: abortRequest(payload.requestId) })),

    [METHODS.complete]: (payload: {
      providerId: string
      model: string
      messages: readonly WireMessage[]
      maxTokens?: number
      thinkingLevel?: string
      sessionId?: string
      workingDirectory?: string
    }) =>
      Effect.tryPromise({
        try: async () => {
          const descriptor = findDescriptor(payload.providerId)
          if (descriptor === undefined) throw new Error('Unknown provider: ' + payload.providerId)

          const apiKey = resolveApiKey(payload.providerId)
          if (apiKey === undefined) {
            throw new Error('No API key configured for ' + descriptor.name)
          }

          const provider = buildProvider(payload.providerId, apiKey)
          if (provider === undefined) throw new Error('Unknown provider: ' + payload.providerId)

          const fitted = await fitRequest(provider, payload.providerId, payload, undefined)

          const result = await provider.chat({
            model: payload.model,
            messages: withSystemPrompt(
              providerHistory(fitted.messages),
              payload.workingDirectory
            ),
            ...(payload.maxTokens !== undefined ? { maxTokens: payload.maxTokens } : {}),
            ...(payload.thinkingLevel !== undefined ? { reasoningEffort: payload.thinkingLevel } : {}),
            ...(payload.sessionId !== undefined ? { sessionId: payload.sessionId } : {}),
          })

          return {
            text: result.text,
            thinking: result.thinking,
            usage: {
              input: Math.floor(result.usage.input),
              output: Math.floor(result.usage.output),
              total: Math.floor(result.usage.total),
            },
            stopReason: result.stopReason,
            ...(result.thinkingSignature !== undefined
              ? { thinkingSignature: result.thinkingSignature }
              : {}),
          }
        },
        catch: asProviderError,
      }),
  }
}
