import type { Message } from '../../chat/types'

const RETRYABLE = new Set(['failed', 'interrupted'])

/** The user turn to resend when the last assistant message died. */
export function failedTurnToResend(messages: readonly Message[], assistantId: string): Message | undefined {
  const last = messages.at(-1)
  if (last === undefined || last.id !== assistantId || last.role !== 'assistant') return undefined
  if (last.work === undefined || !RETRYABLE.has(last.work.status)) return undefined
  for (let index = messages.length - 2; index >= 0; index--) {
    const candidate = messages[index]
    if (candidate?.role === 'user') return candidate
  }
  return undefined
}
