/**
 * Favourite models, kept in the browser store.
 *
 * Stored client side rather than over the wire: this is a preference about the
 * picker, not a fact about the account, and it should survive without a round
 * trip on every toggle.
 */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'black.favouriteModels'

/** The browser store, or null where there is not one. */
function defaultStore(): KeyValueStore | null {
  try {
    // Absent in tests and any non browser context.
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    // Access can throw outright when storage is blocked by policy.
    return null
  }
}

/** Reads a stored list, treating anything malformed as an empty one. */
export function parseFavourites(raw: string | null): string[] {
  if (raw === null) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // A hand-edited or half written value must not poison the picker.
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

export function loadFavourites(store: KeyValueStore | null = defaultStore()): string[] {
  if (store === null) return []
  return parseFavourites(store.getItem(STORAGE_KEY))
}

export function saveFavourites(
  ids: readonly string[],
  store: KeyValueStore | null = defaultStore()
): void {
  if (store === null) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // A full or read only store is not worth failing a click over. The toggle
    // still applies for this session.
  }
}

/** Adds the id if absent, removes it if present. */
export function toggleFavourite(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]
}
