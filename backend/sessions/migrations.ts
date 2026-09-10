import {
  type CompactionEntry,
  CURRENT_SESSION_VERSION,
  type FileEntry,
  type SessionEntry,
  type SessionHeader,
} from './types'
import { generateEntryId } from './ids'

/** Migrate v1 to v2: add id/parentId tree structure. Mutates in place. */
function migrateV1ToV2(entries: FileEntry[]): void {
  const ids = new Set<string>()
  let prevId: string | null = null

  for (const entry of entries) {
    if (entry.type === 'session') {
      entry.version = 2
      continue
    }

    entry.id = generateEntryId(ids)
    entry.parentId = prevId
    prevId = entry.id
    ids.add(entry.id)

    // Convert firstKeptEntryIndex to firstKeptEntryId for compaction.
    if (entry.type === 'compaction') {
      const compaction = entry as CompactionEntry & { firstKeptEntryIndex?: number }
      if (typeof compaction.firstKeptEntryIndex === 'number') {
        const target = entries[compaction.firstKeptEntryIndex]
        if (target !== undefined && target.type !== 'session') {
          compaction.firstKeptEntryId = target.id
        }
        delete compaction.firstKeptEntryIndex
      }
    }
  }
}

/** Migrate v2 to v3: rename the hookMessage role to custom. Mutates in place. */
function migrateV2ToV3(entries: FileEntry[]): void {
  for (const entry of entries) {
    if (entry.type === 'session') {
      entry.version = 3
      continue
    }

    if (entry.type === 'message') {
      const messageEntry = entry as SessionEntry & { message?: { role?: unknown } }
      const message = messageEntry.message
      if (message !== undefined && message !== null && message.role === 'hookMessage') {
        ;(message as { role: string }).role = 'custom'
      }
    }
  }
}

/**
 * Run all migrations needed to reach the current version.
 * Mutates entries in place. Returns true when any migration was applied.
 */
function migrateToCurrentVersion(entries: FileEntry[]): boolean {
  const header = entries.find((entry): entry is SessionHeader => entry.type === 'session')
  const version = header?.version ?? 1

  if (version >= CURRENT_SESSION_VERSION) return false
  if (version < 2) migrateV1ToV2(entries)
  if (version < 3) migrateV2ToV3(entries)

  return true
}

/** Exported for testing. */
export function migrateSessionEntries(entries: FileEntry[]): void {
  migrateToCurrentVersion(entries)
}

export { migrateToCurrentVersion }
