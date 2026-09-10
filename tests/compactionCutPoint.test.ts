import { describe, expect, it } from 'bun:test'
import { findCutPoint, findTurnStartIndex } from '../backend/compaction/cut-point'
import type { AgentMessage, SessionEntry } from '../backend/sessions/types'

/** 400 characters of text estimates to 100 tokens. */
function text(prefix: string, length = 400): string {
  return prefix + 'x'.repeat(Math.max(0, length - prefix.length))
}

function user(id: string, chars = 400): SessionEntry {
  const message: AgentMessage = { role: 'user', content: text(id, chars), timestamp: 1 }
  return { type: 'message', id, parentId: null, timestamp: '2025-01-01T00:00:00Z', message }
}

function assistant(id: string, chars = 400): SessionEntry {
  const message: AgentMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: text(id, chars) }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: 1,
  }
  return { type: 'message', id, parentId: null, timestamp: '2025-01-01T00:00:00Z', message }
}

function toolResult(id: string, chars = 400): SessionEntry {
  const message: AgentMessage = {
    role: 'toolResult',
    toolCallId: 't1',
    toolName: 'read',
    content: [{ type: 'text', text: text(id, chars) }],
    isError: false,
    timestamp: 1,
  }
  return { type: 'message', id, parentId: null, timestamp: '2025-01-01T00:00:00Z', message }
}

function customMessage(id: string, chars = 400): SessionEntry {
  return {
    type: 'custom_message',
    id,
    parentId: null,
    timestamp: '2025-01-01T00:00:00Z',
    customType: 'note',
    content: text(id, chars),
    display: true,
  }
}

function metadata(id: string): SessionEntry {
  return { type: 'model_change', id, parentId: null, timestamp: '2025-01-01T00:00:00Z', provider: 'p', modelId: 'm' }
}

describe('findTurnStartIndex', () => {
  it('finds the user message that opened the turn', () => {
    const entries = [user('u1'), assistant('a1'), user('u2'), assistant('a2')]
    expect(findTurnStartIndex(entries, 3, 0)).toBe(2)
  })

  it('returns -1 when nothing in range opens a turn', () => {
    const entries = [assistant('a1'), assistant('a2')]
    expect(findTurnStartIndex(entries, 1, 0)).toBe(-1)
  })

  it('stops at startIndex', () => {
    const entries = [user('u1'), user('u2')]
    expect(findTurnStartIndex(entries, 1, 1)).toBe(1)
    expect(findTurnStartIndex(entries, 0, 1)).toBe(-1)
  })
})

describe('findCutPoint', () => {
  it('returns the start index when no entry can be cut on', () => {
    const entries = [toolResult('t1'), toolResult('t2')]
    expect(findCutPoint(entries, 0, entries.length, 100)).toEqual({
      firstKeptEntryIndex: 0,
      turnStartIndex: -1,
      isSplitTurn: false,
    })
  })

  it('keeps everything when the budget is never reached', () => {
    const entries = [user('u1'), assistant('a1'), user('u2'), assistant('a2')]
    expect(findCutPoint(entries, 0, entries.length, 100_000)).toEqual({
      firstKeptEntryIndex: 0,
      turnStartIndex: -1,
      isSplitTurn: false,
    })
  })

  it('snaps to the nearest allowed cut point once the budget is exceeded', () => {
    const entries = [user('u1'), assistant('a1'), user('u2'), assistant('a2'), toolResult('t2')]
    // Walking back: tool result 100, assistant 100, user 100 crosses 250.
    const result = findCutPoint(entries, 0, entries.length, 250)
    expect(result.firstKeptEntryIndex).toBe(2)
    expect(result.isSplitTurn).toBe(false)
    expect(result.turnStartIndex).toBe(-1)
  })

  it('never cuts on a tool result', () => {
    const entries = [user('u1'), assistant('a1'), toolResult('t1')]
    const result = findCutPoint(entries, 0, entries.length, 150)
    expect(result.firstKeptEntryIndex).toBe(1)
    expect(entries[result.firstKeptEntryIndex]!.type).toBe('message')
  })

  it('flags a split turn when the cut lands mid-turn', () => {
    const entries = [user('u1'), assistant('a1'), user('u2'), assistant('a2'), toolResult('t2')]
    // Walking back: tool result 100, assistant 100 crosses 150.
    const result = findCutPoint(entries, 0, entries.length, 150)
    expect(result.firstKeptEntryIndex).toBe(3)
    expect(result.isSplitTurn).toBe(true)
    expect(result.turnStartIndex).toBe(2)
  })

  it('pulls in adjacent entries that carry no context', () => {
    const entries = [user('u1'), metadata('m1'), user('u2'), assistant('a2')]
    const result = findCutPoint(entries, 0, entries.length, 150)
    // The cut lands on the second user message, then absorbs the metadata entry.
    expect(result.firstKeptEntryIndex).toBe(1)
    expect(result.isSplitTurn).toBe(true)
    expect(result.turnStartIndex).toBe(0)
  })

  it('treats a custom message entry as a turn start and a valid cut point', () => {
    const entries = [assistant('a1'), customMessage('c1'), customMessage('c2')]
    const result = findCutPoint(entries, 0, entries.length, 150)
    expect(result.firstKeptEntryIndex).toBe(1)
    expect(result.isSplitTurn).toBe(false)
    expect(result.turnStartIndex).toBe(-1)
  })

  it('counts a custom message entry in the token budget', () => {
    const entries = [user('u1'), assistant('a1'), customMessage('c1')]
    // Walking back: custom 100, assistant 100 crosses 150, so the cut snaps
    // forward to the assistant turn that stays whole.
    const result = findCutPoint(entries, 0, entries.length, 150)
    expect(result.firstKeptEntryIndex).toBe(1)
    expect(result.isSplitTurn).toBe(true)
    expect(result.turnStartIndex).toBe(0)
  })

  it('respects the start index boundary', () => {
    const entries = [user('u1'), assistant('a1'), user('u2'), assistant('a2')]
    const result = findCutPoint(entries, 2, entries.length, 100_000)
    expect(result.firstKeptEntryIndex).toBe(2)
  })
})
