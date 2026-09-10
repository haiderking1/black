import { describe, expect, it } from 'bun:test'
import { compact } from '../backend/compaction/compact'
import { createFileOps } from '../backend/compaction/file-ops'
import type {
  CompactionPreparation,
  SummarizationCall,
  SummarizationRequest,
} from '../backend/compaction/types'
import type { AgentMessage, AssistantMessage, Usage } from '../backend/sessions/types'

const SETTINGS = { enabled: true, reserveTokens: 1000, keepRecentTokens: 20000 }

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function assistant(text: string, overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
    ...overrides,
  }
}

/** Records every request and replies with the given responder. */
function recorder(respond?: (request: SummarizationRequest, index: number) => AssistantMessage): {
  call: SummarizationCall
  seen: SummarizationRequest[]
} {
  const seen: SummarizationRequest[] = []
  const call: SummarizationCall = async (request) => {
    seen.push(request)
    return respond
      ? respond(request, seen.length)
      : assistant('summary ' + seen.length, {
          usage: { ...ZERO_USAGE, input: 10, totalTokens: 10 },
        })
  }
  return { call, seen }
}

function preparation(overrides: Partial<CompactionPreparation> = {}): CompactionPreparation {
  const messages: AgentMessage[] = [{ role: 'user', content: 'old turn', timestamp: 1 }]
  return {
    firstKeptEntryId: 'a2',
    messagesToSummarize: messages,
    turnPrefixMessages: [],
    isSplitTurn: false,
    tokensBefore: 600,
    fileOps: createFileOps(),
    settings: SETTINGS,
    ...overrides,
  }
}

describe('compact', () => {
  it('returns the summary with the file operation blocks appended', async () => {
    const { call } = recorder()
    const fileOps = createFileOps()
    fileOps.read.add('/a.ts')
    fileOps.edited.add('/b.ts')

    const result = await compact(preparation({ fileOps }), { reserveTokens: SETTINGS.reserveTokens, call })

    expect(result.firstKeptEntryId).toBe('a2')
    expect(result.tokensBefore).toBe(600)
    expect(result.summary).toBe(
      'summary 1\n\n<read-files>\n/a.ts\n</read-files>\n\n<modified-files>\n/b.ts\n</modified-files>',
    )
    expect(result.details).toEqual({ readFiles: ['/a.ts'], modifiedFiles: ['/b.ts'] })
    expect(result.usage?.totalTokens).toBe(10)
  })

  it('renders the conversation into the request', async () => {
    const { call, seen } = recorder()
    await compact(preparation(), { reserveTokens: SETTINGS.reserveTokens, call })

    expect(seen).toHaveLength(1)
    expect(seen[0]!.text).toContain('<conversation>')
    expect(seen[0]!.text).toContain('[User]: old turn')
    expect(seen[0]!.systemPrompt).toContain('summarize')
  })

  it('switches to the update prompt when a previous summary exists', async () => {
    const { call, seen } = recorder()
    await compact(preparation({ previousSummary: 'prior work' }), {
      reserveTokens: SETTINGS.reserveTokens,
      call,
    })

    expect(seen[0]!.text).toContain('<previous-summary>\nprior work\n</previous-summary>')
    expect(seen[0]!.text).toContain('Keep every fact already in the previous summary')
  })

  it('appends custom instructions without dropping the base prompt', async () => {
    const { call, seen } = recorder()
    await compact(preparation(), {
      reserveTokens: SETTINGS.reserveTokens,
      call,
      customInstructions: 'focus on the parser',
    })

    expect(seen[0]!.text).toContain('Additional focus: focus on the parser')
    expect(seen[0]!.text).toContain('## Goal')
  })

  it('budgets the response from the reserve and honours a caller cap', async () => {
    const { call, seen } = recorder()
    await compact(preparation(), { reserveTokens: 1000, call })
    expect(seen[0]!.maxTokens).toBe(800)

    const capped = recorder()
    await compact(preparation(), { reserveTokens: 1000, call: capped.call, maxResponseTokens: 100 })
    expect(capped.seen[0]!.maxTokens).toBe(100)
  })

  it('merges two summaries for a split turn and adds their usage', async () => {
    const { call, seen } = recorder((_request, index) =>
      assistant('part ' + index, { usage: { ...ZERO_USAGE, input: index * 10, totalTokens: index * 10 } }),
    )

    const result = await compact(
      preparation({
        isSplitTurn: true,
        turnPrefixMessages: [{ role: 'user', content: 'prefix', timestamp: 2 }],
      }),
      { reserveTokens: SETTINGS.reserveTokens, call },
    )

    expect(seen).toHaveLength(2)
    expect(result.summary.startsWith('part 1\n\n---\n\n**Turn Context (split turn):**\n\npart 2')).toBe(true)
    expect(result.usage?.totalTokens).toBe(30)
  })

  it('skips the history call when a split turn has no history left', async () => {
    const { call, seen } = recorder()
    const result = await compact(
      preparation({
        isSplitTurn: true,
        messagesToSummarize: [],
        turnPrefixMessages: [{ role: 'user', content: 'prefix', timestamp: 2 }],
      }),
      { reserveTokens: SETTINGS.reserveTokens, call },
    )

    expect(seen).toHaveLength(1)
    expect(result.summary.startsWith('No prior history.\n\n---\n\n**Turn Context (split turn):**')).toBe(true)
  })

  it('rejects a summary that hit the token cap', async () => {
    const { call } = recorder(() => assistant('half a summary', { stopReason: 'length' }))
    await expect(compact(preparation(), { reserveTokens: SETTINGS.reserveTokens, call })).rejects.toThrow(
      'generation hit the token cap',
    )
  })

  it('rejects a failed summary and reports the provider message', async () => {
    const { call } = recorder(() => assistant('', { stopReason: 'error', errorMessage: 'upstream exploded' }))
    await expect(compact(preparation(), { reserveTokens: SETTINGS.reserveTokens, call })).rejects.toThrow(
      'upstream exploded',
    )
  })

  it('rejects a summary that tried to call a tool', async () => {
    const { call } = recorder(() =>
      assistant('', {
        content: [{ type: 'toolCall', id: 't1', name: 'read', arguments: { path: '/a.ts' } }],
      }),
    )
    await expect(compact(preparation(), { reserveTokens: SETTINGS.reserveTokens, call })).rejects.toThrow(
      'attempted to call a tool',
    )
  })

  it('refuses to return a checkpoint without a kept entry id', async () => {
    const { call } = recorder()
    await expect(
      compact(preparation({ firstKeptEntryId: '' }), { reserveTokens: SETTINGS.reserveTokens, call }),
    ).rejects.toThrow('First kept entry has no id')
  })

  it('propagates a call failure without writing anything', async () => {
    const call: SummarizationCall = async () => {
      throw new Error('network down')
    }
    await expect(compact(preparation(), { reserveTokens: SETTINGS.reserveTokens, call })).rejects.toThrow(
      'network down',
    )
  })
})
