import type { ChatRoute } from '../../../contracts/chat'
import type { ComposerSubmitOptions } from '../../composer'

/** A turn typed while a reply was arriving, waiting for that reply to finish. */
export interface QueuedSend {
  requestId: string
  sessionId: string
  /** The user message already appended for this turn. */
  messageId: string
  content: string
  options: ComposerSubmitOptions | undefined
  providerId: string
  route?: ChatRoute
  /** Directory captured when the turn was queued, so a later project switch cannot retarget it. */
  workingDirectory?: string
  /** Images that went with it, kept so the queue can resend them intact. */
  images: Array<{ mimeType: string; data: string }>
}

export function enqueueSend(queue: readonly QueuedSend[], send: QueuedSend): QueuedSend[] {
  return [...queue, send]
}

export function takeNextSend(
  queue: readonly QueuedSend[]
): { next: QueuedSend; rest: QueuedSend[] } | undefined {
  const next = queue[0]
  if (next === undefined) return undefined
  return { next, rest: queue.slice(1) }
}

/**
 * Drop one queued turn.
 *
 * Returns undefined when the id is not waiting, so a late dismiss cannot
 * rewrite the queue that already drained that turn.
 */
export function dismissSend(
  queue: readonly QueuedSend[],
  requestId: string
): { removed: QueuedSend; rest: QueuedSend[] } | undefined {
  const removed = queue.find((send) => send.requestId === requestId)
  if (removed === undefined) return undefined
  return {
    removed,
    rest: queue.filter((send) => send.requestId !== requestId)
  }
}

/**
 * Move one queued turn to the front.
 *
 * Missing ids leave the queue untouched, so steering a turn that already
 * started cannot invent a duplicate.
 */
export function steerSend(queue: readonly QueuedSend[], requestId: string): QueuedSend[] | undefined {
  const target = queue.find((send) => send.requestId === requestId)
  if (target === undefined) return undefined
  return [target, ...queue.filter((send) => send.requestId !== requestId)]
}
