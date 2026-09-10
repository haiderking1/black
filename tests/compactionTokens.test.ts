import { describe, expect, it } from 'bun:test'
import {
  calculateContextTokens,
  combineUsage,
  estimateContextTokens,
  estimateTokens,
  getLastAssistantUsage,
  isUsage,
  shouldCompact,
  zeroUsage,
} from '../backend/compaction/tokens'
import type { AgentMessage, AssistantMessage, SessionEntry, Usage } from '../backend/sessions/types'

const SETTINGS = { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 }

function usage(partial: Partial<Usage> = {}): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    ...partial,
  }
}

function assistant(
  text: string,
  options: { usage?: Usage; stopReason?: AssistantMessage['stopReason'] } = {},
): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: options.usage ?? usage(),
    stopReason: options.stopReason ?? 'stop',
    timestamp: 1,
  }
}

function messageEntry(id: string, message: AgentMessage): SessionEntry {
  return { type: 'message', id, parentId: null, timestamp: '2025-01-01T00:00:00Z', message }
}

describe('calculateContextTokens', () => {
  it('prefers totalTokens when it is set', () => {
    expect(calculateContextTokens(usage({ totalTokens: 500, input: 1, output: 1 }))).toBe(500)
  })

  it('sums the components when totalTokens is zero', () => {
    expect(calculateContextTokens(usage({ input: 10, output: 20, cacheRead: 30, cacheWrite: 40 }))).toBe(100)
  })

  it('treats non-finite counters as zero', () => {
    expect(calculateContextTokens(usage({ input: Number.NaN, output: 5 }))).toBe(5)
  })
})

describe('estimateTokens', () => {
  it('estimates string content at four characters per token, rounded up', () => {
    expect(estimateTokens({ role: 'user', content: 'abcd', timestamp: 1 })).toBe(1)
    expect(estimateTokens({ role: 'user', content: 'abcde', timestamp: 1 })).toBe(2)
  })

  it('counts an image block at its fixed character weight', () => {
    const message: AgentMessage = {
      role: 'user',
      content: [{ type: 'image', data: '', mimeType: 'image/png' }],
      timestamp: 1,
    }
    expect(estimateTokens(message)).toBe(1200)
  })

  it('counts assistant text, thinking, and tool call arguments', () => {
    const message: AgentMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'a'.repeat(40) },
        { type: 'thinking', thinking: 'b'.repeat(40) },
        { type: 'toolCall', id: 't1', name: 'read', arguments: { path: '/a' } },
      ],
      api: 'test',
      provider: 'test',
      model: 'test',
      usage: usage(),
      stopReason: 'stop',
      timestamp: 1,
    }
    // 40 + 40 + 4 (name) + 13 (arguments JSON) = 97 chars
    expect(estimateTokens(message)).toBe(25)
  })

  it('counts bash execution command and output', () => {
    const message: AgentMessage = {
      role: 'bashExecution',
      command: 'ls',
      output: 'x'.repeat(38),
      exitCode: 0,
      cancelled: false,
      truncated: false,
      timestamp: 1,
    }
    expect(estimateTokens(message)).toBe(10)
  })

  it('counts summaries by their text', () => {
    expect(
      estimateTokens({ role: 'branchSummary', summary: 'x'.repeat(40), fromId: null, timestamp: 1 }),
    ).toBe(10)
    expect(
      estimateTokens({ role: 'compactionSummary', summary: 'x'.repeat(40), tokensBefore: 0, timestamp: 1 }),
    ).toBe(10)
  })

  it('estimates malformed content to zero instead of throwing', () => {
    const broken = { role: 'assistant', content: 'not-an-array', timestamp: 1 } as unknown as AgentMessage
    expect(estimateTokens(broken)).toBe(0)
    const brokenUser = { role: 'user', content: null, timestamp: 1 } as unknown as AgentMessage
    expect(estimateTokens(brokenUser)).toBe(0)
  })
})

describe('estimateContextTokens', () => {
  it('estimates the whole list when no usage is reported', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'a'.repeat(400), timestamp: 1 },
      { role: 'user', content: 'b'.repeat(400), timestamp: 2 },
    ]
    const estimate = estimateContextTokens(messages)
    expect(estimate.tokens).toBe(200)
    expect(estimate.usageTokens).toBe(0)
    expect(estimate.trailingTokens).toBe(200)
    expect(estimate.lastUsageIndex).toBe(null)
  })

  it('anchors on the last usage and estimates only what follows it', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'a'.repeat(400), timestamp: 1 },
      assistant('b'.repeat(40), { usage: usage({ input: 1000, output: 500, totalTokens: 1500 }) }),
      { role: 'user', content: 'c'.repeat(400), timestamp: 3 },
    ]
    const estimate = estimateContextTokens(messages)
    expect(estimate.usageTokens).toBe(1500)
    expect(estimate.trailingTokens).toBe(100)
    expect(estimate.tokens).toBe(1600)
    expect(estimate.lastUsageIndex).toBe(1)
  })

  it('ignores aborted and errored assistant messages', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'a'.repeat(400), timestamp: 1 },
      assistant('b'.repeat(40), { usage: usage({ input: 99 }), stopReason: 'aborted' }),
      assistant('c'.repeat(40), { usage: usage({ input: 50, totalTokens: 50 }) }),
    ]
    const estimate = estimateContextTokens(messages)
    expect(estimate.usageTokens).toBe(50)
    expect(estimate.lastUsageIndex).toBe(2)
  })
})

describe('getLastAssistantUsage', () => {
  it('returns usage from the newest usable assistant entry', () => {
    const entries: SessionEntry[] = [
      messageEntry('1', { role: 'user', content: 'hi', timestamp: 1 }),
      messageEntry('2', assistant('old', { usage: usage({ input: 10, totalTokens: 10 }) })),
      messageEntry('3', { role: 'user', content: 'again', timestamp: 3 }),
      messageEntry('4', assistant('new', { usage: usage({ input: 30, totalTokens: 30 }) })),
    ]
    expect(getLastAssistantUsage(entries)?.totalTokens).toBe(30)
  })

  it('returns undefined when every assistant entry is unusable', () => {
    const entries: SessionEntry[] = [
      messageEntry('1', assistant('broken', { stopReason: 'error' })),
      messageEntry('2', assistant('zeroed')),
    ]
    expect(getLastAssistantUsage(entries)).toBe(undefined)
  })
})

describe('shouldCompact', () => {
  it('stays off when compaction is disabled', () => {
    expect(shouldCompact(1_000_000, 200_000, { ...SETTINGS, enabled: false })).toBe(false)
  })

  it('triggers once the reserve would be eaten into', () => {
    const settings = { ...SETTINGS, reserveTokens: 10_000 }
    expect(shouldCompact(190_000, 200_000, settings)).toBe(false)
    expect(shouldCompact(190_001, 200_000, settings)).toBe(true)
  })
})

describe('usage arithmetic', () => {
  it('zeroUsage carries every required counter', () => {
    const value = zeroUsage()
    expect(value.totalTokens).toBe(0)
    expect(isUsage(value)).toBe(true)
    expect(isUsage({ input: 1 })).toBe(false)
    expect(isUsage(null)).toBe(false)
  })

  it('combineUsage sums counters and cost', () => {
    const first = usage({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4, totalTokens: 10 })
    const second = usage({ input: 5, output: 6, cacheRead: 7, cacheWrite: 8, totalTokens: 26 })
    const total = combineUsage(first, second)
    expect(total.input).toBe(6)
    expect(total.output).toBe(8)
    expect(total.cacheRead).toBe(10)
    expect(total.cacheWrite).toBe(12)
    expect(total.totalTokens).toBe(36)
  })

  it('combineUsage keeps optional counters only when either side reports them', () => {
    const first = usage({ input: 1, cacheWrite1h: 5, reasoning: 2 })
    const second = usage({ input: 1 })
    const total = combineUsage(first, second)
    expect(total.cacheWrite1h).toBe(5)
    expect(total.reasoning).toBe(2)
    expect(combineUsage(second, second).cacheWrite1h).toBe(undefined)
  })

  it('combineUsage tolerates a missing cost record', () => {
    const stripped = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } as unknown as Usage
    expect(combineUsage(stripped, stripped).cost.total).toBe(0)
  })
})
