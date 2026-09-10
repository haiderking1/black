import { describe, expect, it } from 'bun:test'
import { migrateSessionEntries } from '../backend/sessions/migrations'
import type { FileEntry } from '../backend/sessions/types'

describe('migrateSessionEntries', () => {
  it('adds id/parentId to v1 entries', () => {
    const entries: FileEntry[] = [
      { type: 'session', id: 'sess-1', timestamp: '2025-01-01T00:00:00Z', cwd: '/tmp' },
      { type: 'message', timestamp: '2025-01-01T00:00:01Z', message: { role: 'user', content: 'hi', timestamp: 1 } },
      {
        type: 'message',
        timestamp: '2025-01-01T00:00:02Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hello' }],
          api: 'test',
          provider: 'test',
          model: 'test',
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'stop',
          timestamp: 2,
        },
      },
    ] as unknown as FileEntry[]

    migrateSessionEntries(entries)

    expect((entries[0] as { version?: number }).version).toBe(3)

    const msg1 = entries[1] as { id: string; parentId: string | null }
    const msg2 = entries[2] as { id: string; parentId: string | null }

    expect(msg1.id).toBeDefined()
    expect(msg1.id.length).toBe(8)
    expect(msg1.parentId).toBeNull()

    expect(msg2.id).toBeDefined()
    expect(msg2.id.length).toBe(8)
    expect(msg2.parentId).toBe(msg1.id)
  })

  it('converts firstKeptEntryIndex to firstKeptEntryId for legacy compactions', () => {
    const entries: FileEntry[] = [
      { type: 'session', id: 's', timestamp: '2025-01-01T00:00:00Z', cwd: '/tmp' },
      { type: 'message', timestamp: '2025-01-01T00:00:01Z', message: { role: 'user', content: 'a', timestamp: 1 } },
      {
        type: 'compaction',
        timestamp: '2025-01-01T00:00:02Z',
        summary: 'sum',
        firstKeptEntryIndex: 1,
        tokensBefore: 10,
      },
    ] as unknown as FileEntry[]

    migrateSessionEntries(entries)

    const compaction = entries[2] as { firstKeptEntryId?: string; firstKeptEntryIndex?: number }
    expect(compaction.firstKeptEntryId).toBe((entries[1] as { id: string }).id)
    expect(compaction.firstKeptEntryIndex).toBeUndefined()
  })

  it('is idempotent for already-migrated sessions', () => {
    const entries: FileEntry[] = [
      { type: 'session', id: 'sess-1', version: 3, timestamp: '2025-01-01T00:00:00Z', cwd: '/tmp' },
      { type: 'message', id: 'abc12345', parentId: null, timestamp: '2025-01-01T00:00:01Z', message: { role: 'user', content: 'hi', timestamp: 1 } },
      { type: 'message', id: 'def67890', parentId: 'abc12345', timestamp: '2025-01-01T00:00:02Z', message: { role: 'user', content: 'again', timestamp: 2 } },
    ] as unknown as FileEntry[]

    migrateSessionEntries(entries)

    expect((entries[1] as { id: string }).id).toBe('abc12345')
    expect((entries[2] as { id: string }).id).toBe('def67890')
    expect((entries[2] as { parentId: string }).parentId).toBe('abc12345')
  })

  it('renames hookMessage roles to custom during v2 migration', () => {
    const entries: FileEntry[] = [
      { type: 'session', id: 'sess-1', version: 2, timestamp: '2025-01-01T00:00:00Z', cwd: '/tmp' },
      {
        type: 'message',
        id: 'abc12345',
        parentId: null,
        timestamp: '2025-01-01T00:00:01Z',
        message: { role: 'hookMessage', content: 'from a hook', timestamp: 1 },
      },
    ] as unknown as FileEntry[]

    migrateSessionEntries(entries)

    const message = (entries[1] as { message: { role: string } }).message
    expect(message.role).toBe('custom')
  })

  it('treats headerless entries as v1 and migrates them fully', () => {
    // A missing header defaults to version 1, so ids are minted and
    // hookMessage roles are renamed.
    const entries: FileEntry[] = [
      {
        type: 'message',
        timestamp: '2025-01-01T00:00:01Z',
        message: { role: 'hookMessage', content: 'from a hook', timestamp: 1 },
      },
    ] as unknown as FileEntry[]

    migrateSessionEntries(entries)
    const migrated = entries[0] as { id: string; message: { role: string } }
    expect(migrated.id).toBeDefined()
    expect(migrated.message.role).toBe('custom')
  })
})
