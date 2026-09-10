/**
 * An id for one streamed turn, used to stop it later.
 *
 * randomUUID needs a secure context. The renderer is loaded from a dev server or
 * from disk, both of which qualify, but a build served over plain http would not
 * and would throw on every send. The fallback only has to be unique within a
 * session, because these ids are never compared across processes or persisted.
 */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}
