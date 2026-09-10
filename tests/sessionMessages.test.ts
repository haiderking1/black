import { describe, expect, it } from 'bun:test'
import {
  bashExecutionToText,
  BRANCH_SUMMARY_PREFIX,
  BRANCH_SUMMARY_SUFFIX,
  COMPACTION_SUMMARY_PREFIX,
  COMPACTION_SUMMARY_SUFFIX,
  convertToLlm,
  createBranchSummaryMessage,
  createCompactionSummaryMessage,
  createCustomMessage,
  sumUsage,
} from '../backend/sessions/messages'
import type { AgentMessage, Message, Usage } from '../backend/sessions/types'

describe('bashExecutionToText', () => {
  it('renders the command with fenced output', () => {
    const text = bashExecutionToText({ command: 'ls -la', output: 'file.txt', exitCode: 0, cancelled: false, truncated: false })
    const tick = String.fromCharCode(96)
    expect(text).toContain('Ran ' + tick + 'ls -la' + tick)
    expect(text).toContain(tick.repeat(3) + '\nfile.txt\n' + tick.repeat(3))
    expect(text).not.toContain('exited with code')
  })

  it('reports no output and cancellation', () => {
    const text = bashExecutionToText({ command: 'sleep', output: '', exitCode: 0, cancelled: true, truncated: false })
    expect(text).toContain('(no output)')
    expect(text).toContain('(command cancelled)')
  })

  it('reports non-zero exit codes', () => {
    const text = bashExecutionToText({ command: 'false', output: '', exitCode: 3, cancelled: false, truncated: false })
    expect(text).toContain('Command exited with code 3')
  })

  it('points at the full output file when truncated', () => {
    const text = bashExecutionToText({ command: 'ls', output: 'chunk', exitCode: 0, cancelled: false, truncated: true, fullOutputPath: '/tmp/out.txt' })
    expect(text).toContain('Full output: /tmp/out.txt')
  })
})

describe('message factories', () => {
  it('timestamps custom messages from ISO input', () => {
    const message = createCustomMessage('state', 'snapshot', true, { depth: 2 }, '2025-01-01T00:00:00Z')
    expect(message.role).toBe('custom')
    expect(message.display).toBe(true)
    expect(message.details).toEqual({ depth: 2 })
    expect(message.timestamp).toBe(new Date('2025-01-01T00:00:00Z').getTime())
  })

  it('falls back to epoch for invalid timestamps', () => {
    expect(createCustomMessage('x', 'c', false, undefined, 'not-a-date').timestamp).toBe(0)
  })

  it('builds compaction and branch summaries with their markers', () => {
    const compaction = createCompactionSummaryMessage('older stuff', 1234, '2025-01-01T00:00:00Z')
    expect(compaction.summary).toContain('older stuff')
    expect(compaction.tokensBefore).toBe(1234)

    const branch = createBranchSummaryMessage('side trip', 'entry-1', '2025-01-01T00:00:00Z')
    expect(branch.fromId).toBe('entry-1')
  })

  it('exposes the summary prefixes and suffixes', () => {
    expect(COMPACTION_SUMMARY_PREFIX).toContain('compacted')
    expect(COMPACTION_SUMMARY_SUFFIX.trim()).toBe('</summary>')
    expect(BRANCH_SUMMARY_PREFIX).toContain('branch')
    expect(BRANCH_SUMMARY_SUFFIX).toBe('</summary>')
  })
})

describe('convertToLlm', () => {
  it('passes user, assistant, and toolResult messages through', () => {
    const input: AgentMessage[] = [
      { role: 'user', content: 'hi', timestamp: 1 },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }], api: 'a', provider: 'p', model: 'm', usage: usage(), stopReason: 'stop', timestamp: 2 },
      { role: 'toolResult', toolCallId: 't1', toolName: 'read', content: [{ type: 'text', text: 'data' }], isError: false, timestamp: 3 },
    ]
    expect(convertToLlm(input)).toEqual(input as Message[])
  })

  it('converts bash executions to user text and honors excludeFromContext', () => {
    const bash: AgentMessage = {
      role: 'bashExecution',
      command: 'ls',
      output: 'a',
      exitCode: 0,
      cancelled: false,
      truncated: false,
      timestamp: 4,
    }
    const converted = convertToLlm([bash])
    expect(converted).toHaveLength(1)
    expect(converted[0]!.role).toBe('user')

    const excluded = convertToLlm([{ ...bash, excludeFromContext: true }])
    expect(excluded).toHaveLength(0)
  })

  it('wraps custom, compaction, and branch messages as user text', () => {
    const custom = createCustomMessage('inject', 'injected', true, undefined, '2025-01-01T00:00:00Z')
    const compaction = createCompactionSummaryMessage('sum', 10, '2025-01-01T00:00:00Z')
    const branch = createBranchSummaryMessage('side', 'e1', '2025-01-01T00:00:00Z')

    const converted = convertToLlm([custom, compaction, branch])
    expect(converted).toHaveLength(3)
    for (const message of converted) expect(message.role).toBe('user')

    expect((converted[0]!.content as Array<{ text: string }>)[0]!.text).toBe('injected')
    expect((converted[1]!.content as Array<{ text: string }>)[0]!.text).toContain(COMPACTION_SUMMARY_PREFIX)
    expect((converted[1]!.content as Array<{ text: string }>)[0]!.text).toContain('sum')
    expect((converted[2]!.content as Array<{ text: string }>)[0]!.text).toContain(BRANCH_SUMMARY_PREFIX)
  })

  it('flattens string custom content into a text block', () => {
    const custom = createCustomMessage('note', 'plain text', true, undefined, '2025-01-01T00:00:00Z')
    const converted = convertToLlm([custom])
    expect(converted[0]!.content).toEqual([{ type: 'text', text: 'plain text' }])
  })
})

describe('sumUsage', () => {
  it('sums usage and cost, ignoring missing or malformed records', () => {
    const total = sumUsage([usage(1, 2), undefined, usage(3, 4), { } as Usage])
    expect(total.input).toBe(4)
    expect(total.output).toBe(6)
    expect(total.totalTokens).toBe(10)
    expect(total.cost.total).toBe(0.4)
  })

  it('returns zero totals for an empty list', () => {
    const total = sumUsage([])
    expect(total.input).toBe(0)
    expect(total.cost.total).toBe(0)
  })
})

function usage(input = 1, output = 1): Usage {
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0.1, output: 0.1, cacheRead: 0, cacheWrite: 0, total: 0.2 },
  }
}
