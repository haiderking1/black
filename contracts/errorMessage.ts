const MAX_MESSAGE_LENGTH = 2000
const GENERIC_MESSAGES = new Set(['unknown error', 'an error has occurred'])
const CAUSE_FIRST_MESSAGES = new Set(['fetch failed', 'network error', 'request failed'])
const MESSAGE_FIELDS = ['msg', 'error_description', 'detail', 'error', 'errors', 'cause', 'reason', 'failure', 'defect']

function text(value: string): string | undefined {
  const normalized = value.trim()
  if (normalized === '') return undefined
  return normalized.slice(0, MAX_MESSAGE_LENGTH)
}

function extract(value: unknown, seen: Set<object>, depth: number): string | undefined {
  if (typeof value === 'string') return text(value)
  if (depth >= 8 || typeof value !== 'object' || value === null || seen.has(value)) return undefined
  seen.add(value)

  if (value instanceof Error) {
    const message = text(value.message)
    const normalized = message?.toLowerCase()
    if (message !== undefined && !GENERIC_MESSAGES.has(normalized ?? '') && !CAUSE_FIRST_MESSAGES.has(normalized ?? '')) return message
    const cause = extract(value.cause, seen, depth + 1)
    if (cause !== undefined) return cause
    return GENERIC_MESSAGES.has(normalized ?? '') ? undefined : message
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => extract(item, seen, depth + 1))
      .filter((item): item is string => item !== undefined)
    return messages.length === 0 ? undefined : messages.join('; ').slice(0, MAX_MESSAGE_LENGTH)
  }

  const record = value as Record<string, unknown>
  const message = extract(record['message'], seen, depth + 1)
  const normalized = message?.toLowerCase()
  if (message !== undefined && !GENERIC_MESSAGES.has(normalized ?? '') && !CAUSE_FIRST_MESSAGES.has(normalized ?? '')) return message
  for (const key of MESSAGE_FIELDS) {
    const detail = extract(record[key], seen, depth + 1)
    if (detail !== undefined) return detail
  }
  if (message !== undefined && !GENERIC_MESSAGES.has(normalized ?? '')) return message
  const tag = typeof record['_tag'] === 'string' ? record['_tag'] : undefined
  return tag === undefined ? undefined : tag.slice(0, MAX_MESSAGE_LENGTH)
}

/** Pulls a human-readable cause out of native, RPC, and provider error values. */
export function describeError(value: unknown, fallback = 'The operation failed without an error message.'): string {
  return extract(value, new Set<object>(), 0) ?? fallback
}
