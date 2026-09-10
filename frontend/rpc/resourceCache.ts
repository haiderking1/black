/**
 * The last value each screen read from the server.
 *
 * Module level, because the renderer unmounts more than it looks like it does.
 * Moving between settings tabs, or between settings and the chat, tears a screen
 * down and builds it again. A hook holding its answer in component state loses
 * it with the component, so every return trip starts from empty, shows a loading
 * state, and waits a round trip for an answer that has usually not changed.
 *
 * Holding the last answer means a remount paints what it already had and
 * refreshes behind it.
 *
 * Deliberately not a general purpose cache: nothing expires, nothing is
 * invalidated, and every write is just the most recent read. That is enough for
 * server state that only changes when this app changes it, and it is not enough
 * for anything that changes on its own.
 */
const values = new Map<string, unknown>()

/** The last value read under a key, or undefined if nothing has been read. */
export function readCached<T>(key: string): T | undefined {
  return values.get(key) as T | undefined
}

/** Whether anything has been read under a key yet. */
export function hasCached(key: string): boolean {
  return values.has(key)
}

/** Records the most recent read. */
export function writeCached<T>(key: string, value: T): void {
  values.set(key, value)
}

/** Forgets everything. Exists for tests, which must not inherit module state. */
export function clearResourceCache(): void {
  values.clear()
}
