import { describeError } from '../../contracts/errorMessage'

export { describeError } from '../../contracts/errorMessage'

/**
 * Provider failures.
 *
 * Every provider reports the same shapes so callers can act without parsing a
 * message. The codes line up with the retry classifier, which is what lets a
 * rate limit be retried while an auth failure fails fast.
 */

export type ProviderErrorCode =
  | 'auth'
  | 'credits'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'bad_request'
  | 'malformed_response'
  | 'unknown'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly status: number | undefined
  readonly providerId: string

  constructor(providerId: string, code: ProviderErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.providerId = providerId
    this.code = code
    if (status !== undefined) this.status = status
  }
}

/** Map an HTTP status onto a code a caller can branch on. */
export function codeFromStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'credits'
  if (status === 404 || status === 400 || status === 422) return 'bad_request'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'server'
  return 'unknown'
}

/** Preserve vendor codes so quota errors are distinguishable from throttling. */
function asIdentifier(value: unknown): string {
  if (typeof value === 'string' && value !== '') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

export function providerErrorIdentifier(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  const value = body as { error?: unknown; code?: unknown; type?: unknown; metadata?: unknown }
  const inner = typeof value.error === 'object' && value.error !== null
    ? value.error as { code?: unknown; type?: unknown; metadata?: unknown } : value
  const metadata = typeof inner.metadata === 'object' && inner.metadata !== null
    ? inner.metadata as { error_type?: unknown }
    : typeof value.metadata === 'object' && value.metadata !== null
      ? value.metadata as { error_type?: unknown }
      : undefined
  return [inner.code, inner.type, value.code, value.type, metadata?.error_type]
    .map(asIdentifier)
    .filter(item => item !== '')
    .join(' ')
}

const MAX_ERROR_MESSAGE_LENGTH = 2000
const MAX_ERROR_BODY_LENGTH = 64_000

async function readBoundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const decoder = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      text += done ? decoder.decode() : decoder.decode(value, { stream: true })
      if (text.length >= MAX_ERROR_BODY_LENGTH) {
        text = text.slice(0, MAX_ERROR_BODY_LENGTH)
        break
      }
      if (done) break
    }
    return text
  } catch {
    return ''
  } finally {
    try {
      await reader.cancel()
    } catch {
      // The provider may already have closed the body.
    }
    try {
      reader.releaseLock()
    } catch {
      // A failed stream may already have released its lock.
    }
  }
}

/** Read a failed response as JSON, SSE JSON, or bounded plain text. */
export async function readErrorBody(response: Response): Promise<unknown> {
  try {
    const text = (await readBoundedText(response)).trim()
    if (text === '') return undefined
    try {
      return JSON.parse(text) as unknown
    } catch {
      const dataLines = text.split(/\r?\n/).filter((line) => line.startsWith('data:'))
      if (dataLines.length > 0) {
        const payload = dataLines.map((line) => line.slice(5).trim()).filter((line) => line !== '[DONE]').join('\n')
        try {
          return JSON.parse(payload) as unknown
        } catch {
          // Keep the original diagnostic if the gateway's SSE frame is malformed.
        }
      }
      if (response.headers.get('content-type')?.toLowerCase().includes('text/html') === true) {
        const readable = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        return readable.slice(0, MAX_ERROR_MESSAGE_LENGTH)
      }
      return text.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    }
  } catch {
    return undefined
  }
}

function detailMessage(value: unknown, seen = new Set<object>(), depth = 0): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)
  if (depth >= 8 || typeof value !== 'object' || value === null || seen.has(value)) return undefined
  seen.add(value)
  if (Array.isArray(value)) {
    const messages = value.map((item) => detailMessage(item, seen, depth + 1)).filter((item): item is string => item !== undefined)
    return messages.length === 0 ? undefined : messages.join('; ').slice(0, MAX_ERROR_MESSAGE_LENGTH)
  }
  const record = value as Record<string, unknown>
  for (const key of ['message', 'msg', 'detail', 'error_description', 'description', 'reason', 'errors']) {
    const message = detailMessage(record[key], seen, depth + 1)
    if (message !== undefined) return message
  }
  return undefined
}

/** Pull a useful message out of common provider and gateway error envelopes. */
export function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH) || fallback
  if (typeof body !== 'object' || body === null) return fallback
  const envelope = body as Record<string, unknown>
  for (const key of ['error', 'message', 'detail', 'error_description', 'errors', 'cause']) {
    const message = detailMessage(envelope[key])
    if (message !== undefined) return message
  }
  return fallback
}
