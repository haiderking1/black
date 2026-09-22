import { describe, expect, it } from 'bun:test'

import { fitContext } from '../backend/chat/fitContext'
import type { TranscriptMessage } from '../backend/chat/transcript'
import type { AssistantMessage, Usage } from '../backend/sessions/types'

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

const messages: TranscriptMessage[] = [
  { id: 'u1', role: 'user', content: 'x'.repeat(400) },
  { id: 'a1', role: 'assistant', content: 'x'.repeat(400) },
  { id: 'u2', role: 'user', content: 'x'.repeat(400) },
  { id: 'a2', role: 'assistant', content: 'x'.repeat(400) },
  { id: 'u3', role: 'user', content: 'x'.repeat(400) },
  { id: 'a3', role: 'assistant', content: 'x'.repeat(400) },
]

function summaryResponse(): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'Earlier work' }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
  }
}

describe('fitContext progress', () => {
  it('signals immediately before the summary request starts', async () => {
    const order: string[] = []
    const result = await fitContext({
      messages,
      contextWindow: 1000,
      settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 250 },
      force: true,
      onCompactionStart: () => order.push('progress'),
      call: async () => {
        order.push('summary')
        return summaryResponse()
      },
    })

    expect(result.compacted).toBe(true)
    expect(order[0]).toBe('progress')
    expect(order.slice(1)).toEqual(['summary', 'summary'])
  })

  it('does not signal when the transcript has nothing to compact', async () => {
    let started = false
    const result = await fitContext({
      messages: [{ id: 'only', role: 'user', content: 'hello' }],
      contextWindow: 1000,
      settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 20_000 },
      onCompactionStart: () => { started = true },
      call: async () => summaryResponse(),
    })

    expect(result.compacted).toBe(false)
    expect(started).toBe(false)
  })
})
