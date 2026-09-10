import { describe, expect, it } from 'bun:test'
import { prepareCompaction } from '../backend/compaction/prepare'
import type { AgentMessage, SessionEntry, Usage } from '../backend/sessions/types'

const SETTINGS = { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 }

/** All-zero usage keeps the estimator from anchoring on a reported number. */
const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

/** 400 characters estimates to 100 tokens. */
function text(prefix: string): string {
  return prefix + 'x'.repeat(Math.max(0, 400 - prefix.length))
}

function user(id: string): SessionEntry {
  const message: AgentMessage = { role: 'user', content: text(id), timestamp: 1 }
  return { type: 'message', id, parentId: null, timestamp: '2025-01-01T00:00:00Z', message }
}

function assistant(id: string): SessionEntry {
  const message: AgentMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: text(id) }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
  }
  return { type: 'message', id, parentId: null, timestamp: '2025-01-01T00:00:00Z', message }
}

function compaction(id: string, firstKeptEntryId: string, summary: string): SessionEntry {
  return {
    type: 'compaction',
    id,
    parentId: null,
    timestamp: '2025-01-01T00:00:00Z',
    summary,
    firstKeptEntryId,
    tokensBefore: 500,
  }
}

/** Link entries into one linear chain so the path walk reaches all of them. */
function chain(entries: SessionEntry[]): SessionEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    parentId: index === 0 ? null : entries[index - 1]?.id ?? null,
  })) as SessionEntry[]
}

describe('prepareCompaction', () => {
  it('refuses when the newest entry is already a compaction', () => {
    const entries = chain([user('u1'), assistant('a1'), compaction('c1', 'u1', 'done')])
    expect(prepareCompaction(entries, SETTINGS)).toBe(undefined)
  })

  it('refuses when the retained budget covers the whole path', () => {
    const entries = chain([user('u1'), assistant('a1'), user('u2')])
    expect(prepareCompaction(entries, { ...SETTINGS, keepRecentTokens: 100_000 })).toBe(undefined)
  })

  it('refuses when the cut would leave nothing to summarize', () => {
    const entries = chain([user('u1')])
    expect(prepareCompaction(entries, { ...SETTINGS, keepRecentTokens: 50 })).toBe(undefined)
  })

  it('plans a split turn with history and a turn prefix', () => {
    const entries = chain([user('u1'), assistant('a1'), user('u2'), assistant('a2'), user('u3'), assistant('a3')])
    const plan = prepareCompaction(entries, { ...SETTINGS, keepRecentTokens: 250 })

    expect(plan).toBeDefined()
    expect(plan!.firstKeptEntryId).toBe('a2')
    expect(plan!.isSplitTurn).toBe(true)
    expect(plan!.messagesToSummarize.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(plan!.turnPrefixMessages).toHaveLength(1)
    expect(plan!.tokensBefore).toBe(600)
    expect(plan!.previousSummary).toBe(undefined)
    expect(plan!.settings.keepRecentTokens).toBe(250)
  })

  it('carries the previous summary and starts after the previous compaction', () => {
    const entries = chain([
      compaction('c1', 'u1', 'prior work'),
      user('u1'),
      assistant('a1'),
      user('u2'),
      assistant('a2'),
      user('u3'),
      assistant('a3'),
    ])
    const plan = prepareCompaction(entries, { ...SETTINGS, keepRecentTokens: 250 })

    expect(plan).toBeDefined()
    expect(plan!.previousSummary).toBe('prior work')
    expect(plan!.firstKeptEntryId).toBe('a2')
    expect(plan!.messagesToSummarize).toHaveLength(2)
    expect(plan!.turnPrefixMessages).toHaveLength(1)
  })

  it('falls back to the entry after a compaction whose kept id is gone', () => {
    const entries = chain([compaction('c1', 'missing', 'prior work'), user('u1'), assistant('a1'), user('u2'), assistant('a2'), user('u3'), assistant('a3')])
    const plan = prepareCompaction(entries, { ...SETTINGS, keepRecentTokens: 250 })

    expect(plan).toBeDefined()
    expect(plan!.previousSummary).toBe('prior work')
    expect(plan!.messagesToSummarize.length).toBeGreaterThan(0)
  })

  it('collects file operations from the messages being discarded', () => {
    const entries = chain([user('u1'), assistant('a1'), user('u2'), assistant('a2'), user('u3'), assistant('a3')])
    const withCalls = entries.map((entry, index) => {
      if (index !== 1 || entry.type !== 'message') return entry
      return {
        ...entry,
        message: {
          ...entry.message,
          content: [{ type: 'toolCall' as const, id: 't1', name: 'edit', arguments: { path: '/edited.ts' } }],
        },
      } as SessionEntry
    })

    const plan = prepareCompaction(withCalls, { ...SETTINGS, keepRecentTokens: 250 })
    expect(plan).toBeDefined()
    expect([...plan!.fileOps.edited]).toEqual(['/edited.ts'])
  })

  it('skips a repeated compaction while the kept messages still fit', () => {
    // The previous compaction kept u1, and everything since still fits, so a
    // second checkpoint would summarize nothing.
    const entries = chain([compaction('c1', 'u1', 'prior work'), user('u1'), assistant('a1')])
    expect(prepareCompaction(entries, { ...SETTINGS, keepRecentTokens: 100_000 })).toBe(undefined)
  })

  it('re-summarizes previously kept messages once the window moves past them', () => {
    const entries = chain([
      compaction('c1', 'u1', 'prior work'),
      user('u1'),
      assistant('a1'),
      user('u2'),
      assistant('a2'),
      user('u3'),
      assistant('a3'),
    ])
    const plan = prepareCompaction(entries, { ...SETTINGS, keepRecentTokens: 150 })

    expect(plan).toBeDefined()
    // u1 and a1 were the previous compaction's kept tail. The window has moved
    // past them, so they are folded into the new summary alongside u2 and a2.
    expect(plan!.isSplitTurn).toBe(false)
    expect(plan!.messagesToSummarize).toHaveLength(4)
    expect(plan!.turnPrefixMessages).toHaveLength(0)
    // The prior summary itself contributes 3 tokens on top of six 100-token messages.
    expect(plan!.tokensBefore).toBe(603)
  })

  it('handles an empty path', () => {
    expect(prepareCompaction([], SETTINGS)).toBe(undefined)
  })
})
