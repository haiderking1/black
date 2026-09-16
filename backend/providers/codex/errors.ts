/**
 * Codex error bodies.
 *
 * Usage-limit payloads carry a plan type and a reset time. Those are turned
 * into a sentence a person can act on, rather than the raw JSON.
 */

export function usageLimitMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback
  const envelope = body as { error?: unknown; message?: unknown }
  const err =
    typeof envelope.error === 'object' && envelope.error !== null
      ? (envelope.error as { code?: unknown; type?: unknown; message?: unknown; plan_type?: unknown; resets_at?: unknown })
      : undefined
  if (err === undefined) {
    return typeof envelope.message === 'string' && envelope.message !== '' ? envelope.message : fallback
  }

  const code = typeof err.code === 'string' ? err.code : typeof err.type === 'string' ? err.type : ''
  if (/usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code)) {
    const plan = typeof err.plan_type === 'string' ? ' (' + err.plan_type.toLowerCase() + ' plan)' : ''
    const mins =
      typeof err.resets_at === 'number' && Number.isFinite(err.resets_at)
        ? Math.max(0, Math.round((err.resets_at * 1000 - Date.now()) / 60000))
        : undefined
    const when = mins !== undefined ? ' Try again in ~' + String(mins) + ' min.' : ''
    return ('You have hit your ChatGPT usage limit' + plan + '.' + when).trim()
  }

  if (typeof err.message === 'string' && err.message !== '') return err.message
  return fallback
}
