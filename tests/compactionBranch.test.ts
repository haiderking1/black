import { describe, expect, it } from 'bun:test'
import {
  collectEntriesForBranchSummary,
  generateBranchSummary,
  prepareBranchEntries,
} from '../backend/compaction/branch-summarization'
import type { SummarizationCall, SummarizationRequest } from '../backend/compaction/types'
import type { AgentMessage, AssistantMessage, SessionEntry, Usage } from '../backend/sessions/types'

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

function messageEntry(id: string, parentId: string | null, message: AgentMessage): SessionEntry {
  return { type: 'message', id, parentId, timestamp: '2025-01-01T00:00:00Z', message }
}

function userEntry(id: string, parentId: string | null, chars = 400): SessionEntry {
  return messageEntry(id, parentId, { role: 'user', content: text(id).slice(0, chars), timestamp: 1 })
}

function assistantEntry(id: string, parentId: string | null, chars = 400): SessionEntry {
  const message: AgentMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: text(id).slice(0, chars) }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
  }
  return messageEntry(id, parentId, message)
}

function toolResultEntry(id: string, parentId: string | null): SessionEntry {
  return messageEntry(id, parentId, {
    role: 'toolResult',
    toolCallId: 't1',
    toolName: 'read',
    content: [{ type: 'text', text: text(id) }],
    isError: false,
    timestamp: 1,
  })
}

function compactionEntry(id: string, parentId: string | null, summary: string): SessionEntry {
  return {
    type: 'compaction',
    id,
    parentId,
    timestamp: '2025-01-01T00:00:00Z',
    summary,
    firstKeptEntryId: 'u1',
    tokensBefore: 100,
  }
}

function branchSummaryEntry(
  id: string,
  parentId: string | null,
  summary: string,
  details?: unknown,
  fromHook?: boolean,
): SessionEntry {
  return {
    type: 'branch_summary',
    id,
    parentId,
    timestamp: '2025-01-01T00:00:00Z',
    fromId: 'x',
    summary,
    details,
    fromHook,
  }
}

/** Two branches sharing a trunk: u1 -> a1 -> {u2a -> a2a} and {u2b -> a2b}. */
function forkedSession(): SessionEntry[] {
  return [
    userEntry('u1', null),
    assistantEntry('a1', 'u1'),
    userEntry('u2a', 'a1'),
    assistantEntry('a2a', 'u2a'),
    userEntry('u2b', 'a1'),
    assistantEntry('a2b', 'u2b'),
  ]
}

describe('collectEntriesForBranchSummary', () => {
  it('collects the abandoned branch in chronological order', () => {
    const result = collectEntriesForBranchSummary(forkedSession(), 'a2a', 'a2b')
    expect(result.entries.map((entry) => entry.id)).toEqual(['u2a', 'a2a'])
  })

  it('finds the deepest shared entry as the common ancestor', () => {
    expect(collectEntriesForBranchSummary(forkedSession(), 'a2a', 'a2b').commonAncestorId).toBe('a1')
  })

  it('collects nothing without an old position', () => {
    expect(collectEntriesForBranchSummary(forkedSession(), null, 'a2b')).toEqual({
      entries: [],
      commonAncestorId: null,
    })
  })

  it('collects the whole path when the branches do not meet', () => {
    const entries = [
      userEntry('root1', null),
      userEntry('root2', null),
      assistantEntry('leaf2', 'root2'),
    ]
    const result = collectEntriesForBranchSummary(entries, 'root1', 'leaf2')
    expect(result.commonAncestorId).toBe(null)
    expect(result.entries.map((entry) => entry.id)).toEqual(['root1'])
  })

  it('does not hang on a parent cycle', () => {
    const entries = [
      { type: 'message', id: 'a', parentId: 'b', timestamp: 'x', message: { role: 'user', content: 'hi', timestamp: 1 } },
      { type: 'message', id: 'b', parentId: 'a', timestamp: 'x', message: { role: 'user', content: 'hi', timestamp: 1 } },
      userEntry('target', null),
    ] as SessionEntry[]
    expect(() => collectEntriesForBranchSummary(entries, 'a', 'target')).not.toThrow()
  })
})

describe('prepareBranchEntries', () => {
  it('keeps everything when there is no budget', () => {
    // All six entries in the fixture contribute context when nothing is budgeted out.
    const result = prepareBranchEntries(forkedSession(), 0)
    expect(result.messages).toHaveLength(6)
    expect(result.totalTokens).toBe(600)
  })

  it('keeps the newest messages when the branch is too long', () => {
    const entries = [userEntry('u1', null), assistantEntry('a1', 'u1'), userEntry('u2', 'a1')]
    const result = prepareBranchEntries(entries, 150)
    expect(result.messages).toHaveLength(1)
    expect((result.messages[0] as { content: string }).content).toBe(text('u2'))
  })

  it('skips tool results but keeps the turns around them', () => {
    const entries = [userEntry('u1', null), assistantEntry('a1', 'u1'), toolResultEntry('t1', 'a1')]
    const result = prepareBranchEntries(entries, 0)
    expect(result.messages).toHaveLength(2)
  })

  it('turns compaction entries into summary messages', () => {
    const entries = [compactionEntry('c1', null, 'prior summary')]
    const result = prepareBranchEntries(entries, 0)
    expect(result.messages[0]!.role).toBe('compactionSummary')
  })

  it('collects cumulative file lists from earlier branch summaries', () => {
    const entries = [
      branchSummaryEntry('b1', null, 'older', { readFiles: ['/a.ts'], modifiedFiles: ['/b.ts'] }),
      userEntry('u1', 'b1'),
    ]
    const result = prepareBranchEntries(entries, 0)
    expect([...result.fileOps.read]).toEqual(['/a.ts'])
    expect([...result.fileOps.edited]).toEqual(['/b.ts'])
  })

  it('ignores file lists written by an extension hook', () => {
    const entries = [branchSummaryEntry('b1', null, 'older', { readFiles: ['/a.ts'] }, true)]
    expect([...prepareBranchEntries(entries, 0).fileOps.read]).toEqual([])
  })

  it('admits a summary entry that overshoots the budget', () => {
    const entries = [compactionEntry('c1', null, 'x'.repeat(400))]
    const result = prepareBranchEntries(entries, 50)
    expect(result.messages).toHaveLength(1)
    expect(result.totalTokens).toBe(100)
  })

  it('drops a summary entry once the budget is nearly spent', () => {
    const entries = [compactionEntry('c1', null, 'x'.repeat(1000)), userEntry('u1', 'c1', 380)]
    const result = prepareBranchEntries(entries, 100)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]!.role).toBe('user')
  })
})

describe('generateBranchSummary', () => {
  function recorder(respond?: (request: SummarizationRequest, index: number) => AssistantMessage): {
    call: SummarizationCall
    seen: SummarizationRequest[]
  } {
    const seen: SummarizationRequest[] = []
    const call: SummarizationCall = async (request) => {
      seen.push(request)
      return respond
        ? respond(request, seen.length)
        : {
            role: 'assistant',
            content: [{ type: 'text', text: 'BRANCH TEXT' }],
            api: 'test',
            provider: 'test',
            model: 'test',
            usage: { ...ZERO_USAGE, input: 7, totalTokens: 7 },
            stopReason: 'stop',
            timestamp: 1,
          }
    }
    return { call, seen }
  }

  const OPTIONS = { reserveTokens: 1000, call: null as unknown as SummarizationCall }

  it('prepends the branch preamble and appends the file blocks', async () => {
    const { call } = recorder()
    const entries = [
      branchSummaryEntry('b1', null, 'older', { readFiles: ['/a.ts'], modifiedFiles: ['/b.ts'] }),
      userEntry('u1', 'b1'),
    ]
    const result = await generateBranchSummary(entries, { ...OPTIONS, call })

    expect(result.error).toBe(undefined)
    expect(result.summary).toContain('The user explored a different conversation branch')
    expect(result.summary).toContain('BRANCH TEXT')
    expect(result.summary).toContain('<read-files>\n/a.ts\n</read-files>')
    expect(result.readFiles).toEqual(['/a.ts'])
    expect(result.modifiedFiles).toEqual(['/b.ts'])
    expect(result.usage?.totalTokens).toBe(7)
  })

  it('reports nothing to summarize when no entry contributes context', async () => {
    const { call, seen } = recorder()
    const result = await generateBranchSummary([toolResultEntry('t1', null)], { ...OPTIONS, call })
    expect(result.summary).toBe('No content to summarize')
    expect(seen).toHaveLength(0)
  })

  it('derives the token budget from the context window and reserve', async () => {
    const { call, seen } = recorder()
    // A budget of 100 tokens leaves room for only the newest 100-token message.
    const entries = [userEntry('u1', null), assistantEntry('a1', 'u1')]
    await generateBranchSummary(entries, { ...OPTIONS, call, contextWindow: 1100, reserveTokens: 1000 })

    expect(seen).toHaveLength(1)
    expect(seen[0]!.text).toContain('a1')
    expect(seen[0]!.text).not.toContain('u1')
  })

  it('caps the response at 4096 tokens and honours a smaller cap', async () => {
    const { call, seen } = recorder()
    await generateBranchSummary(forkedSession(), { ...OPTIONS, call })
    expect(seen[0]!.maxTokens).toBe(4096)

    const capped = recorder()
    await generateBranchSummary(forkedSession(), { ...OPTIONS, call: capped.call, maxResponseTokens: 500 })
    expect(capped.seen[0]!.maxTokens).toBe(500)
  })

  it('appends custom instructions to the default prompt', async () => {
    const { call, seen } = recorder()
    await generateBranchSummary(forkedSession(), { ...OPTIONS, call, customInstructions: 'focus on auth' })
    expect(seen[0]!.text).toContain('Additional focus: focus on auth')
    expect(seen[0]!.text).toContain('## Next Steps')
  })

  it('replaces the prompt when replaceInstructions is set', async () => {
    const { call, seen } = recorder()
    await generateBranchSummary(forkedSession(), {
      ...OPTIONS,
      call,
      customInstructions: 'ONLY THIS',
      replaceInstructions: true,
    })
    expect(seen[0]!.text.endsWith('ONLY THIS')).toBe(true)
    expect(seen[0]!.text).not.toContain('## Next Steps')
  })

  it('reports an abort as a field', async () => {
    const { call } = recorder(() => ({
      role: 'assistant',
      content: [{ type: 'text', text: 'partial' }],
      api: 'test',
      provider: 'test',
      model: 'test',
      usage: ZERO_USAGE,
      stopReason: 'aborted',
      timestamp: 1,
    }))
    const result = await generateBranchSummary(forkedSession(), { ...OPTIONS, call })
    expect(result.aborted).toBe(true)
    expect(result.summary).toBe(undefined)
  })

  it('reports a length stop as an error instead of throwing', async () => {
    const { call } = recorder(() => ({
      role: 'assistant',
      content: [{ type: 'text', text: 'half' }],
      api: 'test',
      provider: 'test',
      model: 'test',
      usage: ZERO_USAGE,
      stopReason: 'length',
      timestamp: 1,
    }))
    const result = await generateBranchSummary(forkedSession(), { ...OPTIONS, call })
    expect(result.error).toContain('generation hit the token cap')
  })

  it('reports a provider error as a field', async () => {
    const { call } = recorder(() => ({
      role: 'assistant',
      content: [],
      api: 'test',
      provider: 'test',
      model: 'test',
      usage: ZERO_USAGE,
      stopReason: 'error',
      errorMessage: 'upstream exploded',
      timestamp: 1,
    }))
    const result = await generateBranchSummary(forkedSession(), { ...OPTIONS, call })
    expect(result.error).toContain('upstream exploded')
  })

  it('rejects a summary that tried to call a tool', async () => {
    const { call } = recorder(() => ({
      role: 'assistant',
      content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: {} }],
      api: 'test',
      provider: 'test',
      model: 'test',
      usage: ZERO_USAGE,
      stopReason: 'stop',
      timestamp: 1,
    }))
    const result = await generateBranchSummary(forkedSession(), { ...OPTIONS, call })
    expect(result.error).toContain('attempted to call a tool')
  })
})
