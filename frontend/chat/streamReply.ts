import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import type { ChatStreamEvent } from '../../contracts/chat'

export interface ReplyHandlers {
  onThinking(text: string): void
  /** Reasoning finished, after this long. Called at most once. */
  onThinkingDone(elapsedMs: number): void
  onText(text: string): void
  /** The stream failed partway. Text already delivered is kept. */
  onFailure(message: string): void
  /**
   * The turn ended. Undefined when it ended without saying why.
   *
   * Worth knowing because 'aborted' is a stop the reader asked for, and a turn
   * that produced nothing before it was stopped should not be described as an
   * empty reply.
   */
  onDone(stopReason: string | undefined): void
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

        if (event.type === 'error') {
          closeThinking()
          handlers.onFailure(event.message ?? 'The stream failed.')
          return
        }

        closeThinking()
        handlers.onDone(event.type === 'done' ? event.stopReason : undefined)
      })
    )
  )

  closeThinking()
}
