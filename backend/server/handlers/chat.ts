import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { ProviderConfigError } from '../../../contracts/errors'
import type { ChatStreamEvent } from '../../../contracts/chat'
import { METHODS } from '../../../contracts/methods'
import { abortRequest, beginRequest, endRequest } from '../../chat/inflight'
import { withSystemPrompt } from '../../chat/systemPrompt'
import { resolveApiKey } from '../../providers/credentials'
import { findDescriptor } from '../../providers/descriptors'
import { createOpenCodeProvider } from '../../providers/opencode'
import type { Provider } from '../../providers/types'

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

export function chatHandlers() {
  return {
    // Streaming. A failure is delivered as an event rather than failing the
    // stream, so text already rendered is not thrown away by a late error.
    [METHODS.stream]: (payload: {
      providerId: string
      model: string
      messages: readonly { role: 'system' | 'user' | 'assistant'; content: string }[]
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
          yield* resolved.provider.streamChat({
            model: payload.model,
            messages: withSystemPrompt(
              payload.messages.map((message) => ({ role: message.role, content: message.content })),
              payload.workingDirectory
            ),
            ...(payload.maxTokens !== undefined ? { maxTokens: payload.maxTokens } : {}),
            ...(payload.thinkingLevel !== undefined ? { reasoningEffort: payload.thinkingLevel } : {}),
            ...(payload.sessionId !== undefined ? { sessionId: payload.sessionId } : {}),
            ...(controller !== null ? { signal: controller.signal } : {}),
          })
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

    // Reports whether anything was found. A turn that finished a moment ago is
    // not an error: the click landed on a reply that had already ended.
    [METHODS.cancel]: (payload: { requestId: string }) =>
      Effect.sync(() => ({ cancelled: abortRequest(payload.requestId) })),

    [METHODS.complete]: (payload: {
      providerId: string
      model: string
      messages: readonly { role: 'system' | 'user' | 'assistant'; content: string; thinkingSignature?: string }[]
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

          const result = await provider.chat({
            model: payload.model,
            messages: withSystemPrompt(
              payload.messages.map((message) => ({
                role: message.role,
                content: message.content,
                ...(message.thinkingSignature !== undefined
                  ? { thinkingSignature: message.thinkingSignature }
                  : {}),
              })),
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
