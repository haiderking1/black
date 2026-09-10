/**
 * A cached fetch with single-flight.
 *
 * A catalog changes on the order of days, so refetching it per call wastes a
 * round trip. Concurrent callers share one in-flight request rather than each
 * starting their own, and a failed load is not cached, so the next caller can
 * try again.
 */

export interface TtlCacheOptions {
  ttlMs: number
  /** Injectable clock so tests do not have to wait. */
  now?: () => number
}

export interface TtlCache<T> {
  /** The cached value, loading it if needed. */
  get(): Promise<T>
  /** The cached value without loading. Undefined when absent or stale. */
  peek(): T | undefined
  /** Discard the cached value and load a fresh one. */
  refresh(): Promise<T>
  /** Discard the cached value. */
  invalidate(): void
}

export function createTtlCache<T>(load: () => Promise<T>, options: TtlCacheOptions): TtlCache<T> {
  const now = options.now ?? Date.now
  let value: T | undefined
  let loadedAt = 0
  let inFlight: Promise<T> | null = null

  const isFresh = (): boolean => value !== undefined && now() - loadedAt < options.ttlMs

  const start = (): Promise<T> => {
    const pending = load().then(
      (result) => {
        value = result
        loadedAt = now()
        inFlight = null
        return result
      },
      (error: unknown) => {
        // A failure is never cached, so a transient outage does not stick.
        inFlight = null
        throw error
      },
    )
    inFlight = pending
    return pending
  }

  return {
    get: () => {
      if (isFresh()) return Promise.resolve(value as T)
      if (inFlight !== null) return inFlight
      return start()
    },
    peek: () => (isFresh() ? value : undefined),
    refresh: () => {
      if (inFlight !== null) return inFlight
      return start()
    },
    invalidate: () => {
      value = undefined
      loadedAt = 0
    },
  }
}
