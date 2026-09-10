import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import type { ChatStreamEvent, ToolCall } from '../../contracts/chat'

export interface ReplyReport {
  /** Undefined when the turn ended without saying why. */
  stopReason: string | undefined
  /** Prompt tokens the provider reported, which is the real context size. */
  inputTokens: number | undefined
  /** What the model can hold, when the server reported it. */
  contextWindow: number | undefined
}

export interface ReplyHandlers {
  onThinking(text: string): void
  /** Reasoning finished, after this long. Called at most once. */
  onThinkingDone(elapsedMs: number): void
  onText(text: string): void
  /** The stream failed partway. Text already delivered is kept. */
  onFailure(message: string): void
  /** The turn ended, with what the provider reported about it. */
  onDone(report: ReplyReport): void
  /** Older turns were folded into a summary before this turn was sent. */
  onCompacted(before: number, after: number | undefined): void
  /**
   * The model asked for tools. Called once per round, before any of them run,
   * so the interface can show a call as in progress rather than only after it
   * finishes.
   */
  onToolCalls(calls: readonly ToolCall[]): void
  /** One call finished, successfully or not. */
  onToolResult(callId: string, result: string, isError: boolean, details: unknown): void
}

/**
 * Drives one streamed reply, splitting reasoning from answer.
 *
 * The thinking clock starts on the first reasoning token, not when the request
 * is sent, because time spent waiting on the connection is not time spent
 * thinking.
 *
 * Thinking ends at the first token of the answer. A turn that reasons and then
 * fails, or reasons and is cancelled, still closes the block, so it does not sit
 * shimmering forever.
 *
 * The error channel is left generic: a transport failure is not something this
 * function can act on, and naming Effect's RPC error type here would tie a
 * message-shaping module to one transport.
 */
export async function consumeReply<E>(
  events: Stream.Stream<ChatStreamEvent, E, never>,
  handlers: ReplyHandlers
): Promise<void> {
  let startedAt: number | null = null
  let closed = false

  const closeThinking = (): void => {
    if (closed || startedAt === null) return
    closed = true
    handlers.onThinkingDone(Date.now() - startedAt)
  }

  await Effect.runPromise(
    Stream.runForEach(events, (event) =>
      Effect.sync(() => {
        if (event.type === 'thinking') {
          if (event.text === undefined) return
          if (startedAt === null) startedAt = Date.now()
          handlers.onThinking(event.text)
          return
        }

        if (event.type === 'text') {
          if (event.text === undefined) return
          closeThinking()
          handlers.onText(event.text)
          return
        }

        if (event.type === 'compacted') {
          handlers.onCompacted(event.tokensBefore ?? 0, event.tokensAfter)
          return
        }

        // A tool call is not a token of the answer, so it also closes reasoning.
        // Leaving the block shimmering while a file is read would look like the
        // model is still thinking when it is actually waiting on disk.
        if (event.type === 'tool_calls') {
          closeThinking()
          handlers.onToolCalls(event.toolCalls ?? [])
          return
        }

        if (event.type === 'tool_result') {
          closeThinking()
          handlers.onToolResult(
            event.toolCallId ?? '',
            event.toolResult ?? '',
            event.toolIsError === true,
            event.toolDetails
          )
          return
        }

        if (event.type === 'error') {
          closeThinking()
          handlers.onFailure(event.message ?? 'The stream failed.')
          return
        }

        closeThinking()
        handlers.onDone({
          stopReason: event.type === 'done' ? event.stopReason : undefined,
          inputTokens: event.usage?.input,
          contextWindow: event.contextWindow
        })
      })
    )
  )

  closeThinking()
}
