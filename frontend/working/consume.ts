import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import type { ChatStreamEvent } from '../../contracts/chat'
import type { Message } from '../chat/types'
import { describeRpcError } from '../rpc'
import { applyWorkEvent, finishWork } from './reducer'

/** All termination paths settle the saved turn, without replacing its partial answer. */
export async function consumeWork<E>(
  events: Stream.Stream<ChatStreamEvent, E, never>,
  patch: (update: (message: Message) => Message) => void,
  now: () => number = Date.now
): Promise<void> {
  let terminal = false
  try {
    await Effect.runPromise(Stream.runForEach(events, event => Effect.sync(() => {
      if (terminal) return
      const at = now()
      patch(m => applyWorkEvent(m, event, at))
      if (event.type === 'done' || event.type === 'error') terminal = true
    })))
    if (!terminal) {
      const at = now()
      patch(m => finishWork(m, 'interrupted', at, 'Connection ended before the reply finished.'))
    }
  } catch (error) {
    const at = now()
    patch(m => finishWork(m, 'interrupted', at, describeRpcError(error)))
  }
}
