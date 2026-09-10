import { describe, expect, it } from 'bun:test'
import {
  extractSummarizationText,
  getSummarizationFailure,
  summarizationTriedToolCall,
} from '../backend/compaction/response'
import { generateSummary, generateSummaryWithUsage } from '../backend/compaction/summarize'
import type { SummarizationCall, SummarizationRequest } from '../backend/compaction/types'
import type { AgentMessage, AssistantMessage, Usage } from '../backend/sessions/types'
import { UPDATE_SUMMARIZATION_PROMPT } from '../backend/compaction/prompts'

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'TEXT' }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
    ...overrides,
  }
}

function recorder(response?: AssistantMessage): { call: SummarizationCall; seen: SummarizationRequest[] } {
  const seen: SummarizationRequest[] = []
  const call: SummarizationCall = async (request) => {
    seen.push(request)
    return response ?? assistant()
  }
  return { call, seen }
}

const MESSAGES: AgentMessage[] = [{ role: 'user', content: 'do the thing', timestamp: 1 }]

describe('getSummarizationFailure', () => {
  it('passes a completed response', () => {
    expect(getSummarizationFailure(assistant(), 'Summarization')).toBe(undefined)
  })

  it('rejects a response that hit the token cap', () => {
    const failure = getSummarizationFailure(assistant({ stopReason: 'length' }), 'Summarization')
    expect(failure).toContain('Summarization failed')
    expect(failure).toContain('incomplete')
  })

  it('stays silent on an abort, leaving the guard to the call site', () => {
    // pi reports nothing here. Its session layer checks the abort signal before
    // appending, so an aborted summary never reaches the session file.
    expect(getSummarizationFailure(assistant({ stopReason: 'aborted' }), 'Summarization')).toBe(undefined)
  })

  it('reports the provider error message when there is one', () => {
    const failure = getSummarizationFailure(
      assistant({ stopReason: 'error', errorMessage: 'socket closed' }),
      'Summarization',
    )
    expect(failure).toContain('socket closed')
  })

  it('falls back to a generic reason when the provider sends no message', () => {
    const failure = getSummarizationFailure(assistant({ stopReason: 'error' }), 'Summarization')
    expect(failure).toContain('Unknown error')
  })
})

describe('extractSummarizationText', () => {
  it('joins text blocks and ignores other block types', () => {
    const text = extractSummarizationText(
      assistant({
        content: [
          { type: 'text', text: 'one' },
          { type: 'thinking', thinking: 'ignored' },
          { type: 'text', text: 'two' },
        ],
      }),
    )
    expect(text).toBe('onetwo')
  })

  it('returns an empty string for malformed content', () => {
    const broken = { role: 'assistant', content: null, timestamp: 1 } as unknown as AssistantMessage
    expect(extractSummarizationText(broken)).toBe('')
  })
})

describe('summarizationTriedToolCall', () => {
  it('is false for prose and true for a tool call', () => {
    expect(summarizationTriedToolCall(assistant())).toBe(false)
    expect(
      summarizationTriedToolCall(
        assistant({ content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: {} }] }),
      ),
    ).toBe(true)
  })
})

describe('generateSummary', () => {
  it('returns the text without the usage record', async () => {
    const { call } = recorder(assistant({ usage: { ...ZERO_USAGE, input: 3, totalTokens: 3 } }))
    const text = await generateSummary(MESSAGES, { reserveTokens: 1000, call })
    expect(text).toBe('TEXT')
  })

  it('returns text and usage from the full call', async () => {
    const { call } = recorder(assistant({ usage: { ...ZERO_USAGE, input: 3, totalTokens: 3 } }))
    const result = await generateSummaryWithUsage(MESSAGES, { reserveTokens: 1000, call })
    expect(result.text).toBe('TEXT')
    expect(result.usage.totalTokens).toBe(3)
  })

  it('substitutes a zero usage record when the response carries none', async () => {
    const { call } = recorder({ ...assistant(), usage: undefined } as unknown as AssistantMessage)
    const result = await generateSummaryWithUsage(MESSAGES, { reserveTokens: 1000, call })
    expect(result.usage.totalTokens).toBe(0)
    expect(result.usage.cost.total).toBe(0)
  })

  it('uses the initial prompt on a first compaction', async () => {
    const { call, seen } = recorder()
    await generateSummary(MESSAGES, { reserveTokens: 1000, call })
    expect(seen[0]!.text).toContain('Write a context checkpoint')
    expect(seen[0]!.text).not.toContain('<previous-summary>')
  })

  it('uses the update prompt once a summary exists', async () => {
    const { call, seen } = recorder()
    await generateSummary(MESSAGES, { reserveTokens: 1000, call, previousSummary: 'earlier' })
    expect(seen[0]!.text).toContain(UPDATE_SUMMARIZATION_PROMPT)
  })

  it('never budgets less than one token', async () => {
    const { call, seen } = recorder()
    await generateSummary(MESSAGES, { reserveTokens: 0, call })
    expect(seen[0]!.maxTokens).toBe(1)
  })

  it('passes the session id and abort signal through', async () => {
    const { call, seen } = recorder()
    const controller = new AbortController()
    await generateSummary(MESSAGES, {
      reserveTokens: 1000,
      call,
      sessionId: 'route-1',
      signal: controller.signal,
    })
    expect(seen[0]!.sessionId).toBe('route-1')
    expect(seen[0]!.signal).toBe(controller.signal)
  })

  it('omits optional routing fields when the caller supplies none', async () => {
    const { call, seen } = recorder()
    await generateSummary(MESSAGES, { reserveTokens: 1000, call })
    expect('sessionId' in seen[0]!).toBe(false)
    expect('signal' in seen[0]!).toBe(false)
  })

  it('throws when the model answers with a tool call', async () => {
    const { call } = recorder(assistant({ content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: {} }] }))
    await expect(generateSummary(MESSAGES, { reserveTokens: 1000, call })).rejects.toThrow(
      'attempted to call a tool',
    )
  })
})
