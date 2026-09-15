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

/** Pull a message out of the error envelope these gateways return, if present. */
export function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback
  const envelope = body as { error?: unknown; message?: unknown }
  if (typeof envelope.message === 'string' && envelope.message !== '') return envelope.message
  const error = envelope.error
  if (typeof error === 'string' && error !== '') return error
  if (typeof error === 'object' && error !== null) {
    const inner = (error as { message?: unknown }).message
    if (typeof inner === 'string' && inner !== '') return inner
  }
  return fallback
}
