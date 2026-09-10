import { retryDelayMs } from './reference/retry'
import { setTimeout as delay } from 'node:timers/promises'
import { modelErrorEvent, retryableModelError } from './classify'
import type { ChatStreamEvent } from '../../providers/types'

export const MODEL_RETRIES = 4
export const MODEL_RETRY_DELAY_MS = 5000

type Wait = (signal?: AbortSignal) => Promise<void>
const wait: Wait = async signal => { await delay(retryDelayMs({ baseDelayMs: MODEL_RETRY_DELAY_MS, maxAgentDelayMs: MODEL_RETRY_DELAY_MS }, 1), undefined, { signal }) }

/** Retry only before visible output or tool requests, never replay a partial reply. */
export async function* retryModelStream(
  stream: () => AsyncGenerator<ChatStreamEvent>,
  signal?: AbortSignal,
  pause: Wait = wait,
): AsyncGenerator<ChatStreamEvent> {
  for (let attempt = 0; attempt <= MODEL_RETRIES; attempt++) {
    if (signal?.aborted) { yield { type: 'done', stopReason: 'aborted' }; return }
    let started = false
    let completed = false
    let failure: ChatStreamEvent | undefined
    try {
      for await (const event of stream()) {
        if (signal?.aborted) { yield { type: 'done', stopReason: 'aborted' }; return }
        if (event.type === 'error') { failure = event; break }
        if (event.type === 'done' && event.stopReason === 'error') {
          failure = { type: 'error', message: 'Model request failed.' }; break
        }
        if (event.type === 'done') completed = true
        if ((event.type === 'text' && event.text) || (event.type === 'thinking' && event.text) || event.type === 'tool_calls') started = true
        yield event
      }
    } catch (error) {
      failure = modelErrorEvent(error)
    }
    if (signal?.aborted) { yield { type: 'done', stopReason: 'aborted' }; return }
    if (!failure && completed) return
    failure ??= { type: 'error', message: 'Provider connection ended before the round finished.' }
    if (started || attempt === MODEL_RETRIES || !retryableModelError(failure)) { yield failure; return }
    try { await pause(signal) } catch (error) {
      if (signal?.aborted) { yield { type: 'done', stopReason: 'aborted' }; return }
      throw error
    }
  }
}
