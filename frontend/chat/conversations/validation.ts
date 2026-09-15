import type { Message } from '../types'

export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return typeof m.id === 'string' && m.id !== '' && (m.role === 'user' || m.role === 'assistant')
    && typeof m.content === 'string' && typeof m.timestamp === 'string'
}
