import { describe, expect, it } from 'bun:test'
import { collectEntriesForBranchSummary, generateBranchSummary, prepareBranchEntries } from '../backend/compaction/branch-summarization'
import { findCutPoint, findTurnStartIndex } from '../backend/compaction/cut-point'
import { extractFileOperations, extractFileOpsFromMessage } from '../backend/compaction/file-ops'
import { prepareCompaction } from '../backend/compaction/prepare'
import { estimateContextTokens, estimateMessagesTokens, estimateTokens, isUsage } from '../backend/compaction/tokens'
import type { SummarizationCall } from '../backend/compaction/types'
import { buildSessionContext, sessionEntryToContextMessages } from '../backend/sessions/context'
import type { AgentMessage, SessionEntry } from '../backend/sessions/types'

/**
 * Regression tests for hostile input found by external audit. Session files are
 * parsed without validation, so a JSON null or a truncated line reaches these
 * functions as readily as a missing field. Nothing here may throw.
 */

const SETTINGS = { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 }

function text(prefix: string, length = 400): string {
  return prefix + 'x'.repeat(Math.max(0, length - prefix.length))
}

function userEntry(id: string, parentId: string | null): SessionEntry {
  return { type: 'message', id, parentId, timestamp: '2025-01-01T00:00:00Z', message: { role: 'user', content: text(id), timestamp: 1 } }
}

/** A message entry that lost its payload, as a hand-edited or truncated file would. */
function payloadlessEntry(id: string, parentId: string | null): SessionEntry {
  return { type: 'message', id, parentId, timestamp: '2025-01-01T00:00:00Z' } as unknown as SessionEntry
}

describe('message entries without a payload', () => {
  const entries: SessionEntry[] = [userEntry('u1', null), payloadlessEntry('u2', 'u1'), userEntry('u3', 'u2')]

  it('rebuilds a session context without throwing', () => {
    expect(() => buildSessionContext(entries)).not.toThrow()
  })

  it('projects a payloadless entry to nothing', () => {
    expect(sessionEntryToContextMessages(entries[1]!)).toEqual([])
  })

  it('plans a compaction without throwing', () => {
    expect(() => prepareCompaction(entries, SETTINGS)).not.toThrow()
  })

  it('prepares branch entries without throwing', () => {
    expect(() => prepareBranchEntries(entries, 100)).not.toThrow()
  })

  it('generates a branch summary without throwing', async () => {
    const call: SummarizationCall = async () => ({
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      api: 'test',
      provider: 'test',
      model: 'test',
      usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop',
      timestamp: 1,
    })
    const result = await generateBranchSummary(entries, { reserveTokens: 1000, call })
    expect(result.error).toBe(undefined)
  })
})

describe('null elements in parsed data', () => {
  const nulls = [null] as unknown as AgentMessage[]

  it('estimates null messages to zero instead of throwing', () => {
    expect(estimateTokens(null as unknown as AgentMessage)).toBe(0)
    expect(estimateMessagesTokens(nulls)).toBe(0)
    expect(estimateContextTokens(nulls).tokens).toBe(0)
  })

  it('cuts around null entries instead of throwing', () => {
    expect(() => findCutPoint([null] as unknown as SessionEntry[], 0, 1, 100)).not.toThrow()
    expect(() => findTurnStartIndex([null] as unknown as SessionEntry[], 0, 0)).not.toThrow()
  })

  it('ignores null entries and messages in file tracking', () => {
    expect(() => extractFileOpsFromMessage(null as unknown as AgentMessage, { read: new Set(), written: new Set(), edited: new Set() })).not.toThrow()
    expect([...extractFileOperations([null] as unknown as AgentMessage[], [], -1).read]).toEqual([])
  })

  it('prepares branch entries with null elements present', () => {
    expect(() => prepareBranchEntries([null] as unknown as SessionEntry[], 100)).not.toThrow()
  })
})

describe('usage records', () => {
  it('rejects non-finite counters so they cannot become JSON null', () => {
    expect(isUsage({ input: Number.NaN, totalTokens: 5 })).toBe(false)
    expect(isUsage({ input: 1, totalTokens: Number.POSITIVE_INFINITY })).toBe(false)
    expect(isUsage({ input: 1, totalTokens: 5 })).toBe(true)
  })
})

describe('branch entry collection with unreachable ids', () => {
  const entries = [userEntry('a1', null), userEntry('a2', 'a1')]

  it('reports no common ancestor for an unknown old leaf', () => {
    expect(collectEntriesForBranchSummary(entries, 'unknown', 'a2')).toEqual({ entries: [], commonAncestorId: null })
  })

  it('reports no common ancestor for an unknown target', () => {
    // Falling back to the newest entry here would name a false ancestor.
    expect(collectEntriesForBranchSummary(entries, 'a1', 'unknown').commonAncestorId).toBe(null)
  })
})

describe('branch token budget fallbacks', () => {
  function recorder(): { call: SummarizationCall; text: () => string } {
    let captured = ''
    const call: SummarizationCall = async (request) => {
      captured = request.text
      return {
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        api: 'test',
        provider: 'test',
        model: 'test',
        usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: 1,
      }
    }
    return { call, text: () => captured }
  }

  it('uses the pi default reserve when the caller omits one', async () => {
    // 500k characters is 125k tokens, more than the 111616 budget the default
    // 16384 reserve leaves. A missing reserve would disable trimming entirely
    // and let the oversized message through.
    const oversized: AgentMessage = { role: 'user', content: 'y'.repeat(500_000), timestamp: 1 }
    const entries: SessionEntry[] = [
      { type: 'message', id: 'huge', parentId: null, timestamp: '2025-01-01T00:00:00Z', message: oversized },
      userEntry('small', 'huge'),
    ]

    const { call, text } = recorder()
    await generateBranchSummary(entries, { reserveTokens: undefined as unknown as number, call })

    expect(text()).not.toContain('yyyy')
    expect(text()).toContain('small')
  })

  it('falls back for a non-finite reserve and a zero window', async () => {
    const { call } = recorder()
    await expect(
      generateBranchSummary([userEntry('u1', null)], {
        reserveTokens: Number.NaN,
        contextWindow: 0,
        call,
      }),
    ).resolves.toBeDefined()
  })
})
