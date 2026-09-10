import { describe, expect, it } from 'bun:test'
import {
  computeFileLists,
  createFileOps,
  extractFileOperations,
  extractFileOpsFromMessage,
  formatFileOperations,
} from '../backend/compaction/file-ops'
import type { AgentMessage, SessionEntry } from '../backend/sessions/types'

function assistantWithCalls(calls: Array<{ name: string; arguments: unknown }>): AgentMessage {
  return {
    role: 'assistant',
    content: calls.map((call, index) => ({
      type: 'toolCall' as const,
      id: 't' + index,
      name: call.name,
      arguments: call.arguments as Record<string, unknown>,
    })),
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: 1,
  }
}

describe('extractFileOpsFromMessage', () => {
  it('records read, write, and edit paths separately', () => {
    const ops = createFileOps()
    extractFileOpsFromMessage(
      assistantWithCalls([
        { name: 'read', arguments: { path: '/a.ts' } },
        { name: 'write', arguments: { path: '/b.ts' } },
        { name: 'edit', arguments: { path: '/c.ts' } },
      ]),
      ops,
    )
    expect([...ops.read]).toEqual(['/a.ts'])
    expect([...ops.written]).toEqual(['/b.ts'])
    expect([...ops.edited]).toEqual(['/c.ts'])
  })

  it('ignores tool calls that are not file operations', () => {
    const ops = createFileOps()
    extractFileOpsFromMessage(assistantWithCalls([{ name: 'bash', arguments: { path: '/a.ts' } }]), ops)
    expect([...ops.read]).toEqual([])
  })

  it('ignores calls without a usable path', () => {
    const ops = createFileOps()
    extractFileOpsFromMessage(
      assistantWithCalls([
        { name: 'read', arguments: {} },
        { name: 'read', arguments: { path: '' } },
        { name: 'read', arguments: { path: 42 } },
      ]),
      ops,
    )
    expect([...ops.read]).toEqual([])
  })

  it('ignores messages that are not assistant turns', () => {
    const ops = createFileOps()
    extractFileOpsFromMessage({ role: 'user', content: 'hi', timestamp: 1 }, ops)
    expect([...ops.read]).toEqual([])
  })

  it('tolerates malformed content', () => {
    const ops = createFileOps()
    const broken = { role: 'assistant', content: 'nope', timestamp: 1 } as unknown as AgentMessage
    expect(() => extractFileOpsFromMessage(broken, ops)).not.toThrow()
  })
})

describe('computeFileLists', () => {
  it('splits read-only files from modified ones and sorts both', () => {
    const ops = createFileOps()
    ops.read.add('/z.ts')
    ops.read.add('/a.ts')
    ops.read.add('/shared.ts')
    ops.written.add('/m.ts')
    ops.edited.add('/shared.ts')

    expect(computeFileLists(ops)).toEqual({
      readFiles: ['/a.ts', '/z.ts'],
      modifiedFiles: ['/m.ts', '/shared.ts'],
    })
  })

  it('returns empty lists for no operations', () => {
    expect(computeFileLists(createFileOps())).toEqual({ readFiles: [], modifiedFiles: [] })
  })
})

describe('formatFileOperations', () => {
  it('renders both tag blocks', () => {
    const text = formatFileOperations(['/a.ts'], ['/b.ts'])
    expect(text).toBe('\n\n<read-files>\n/a.ts\n</read-files>\n\n<modified-files>\n/b.ts\n</modified-files>')
  })

  it('renders only the block that has entries', () => {
    expect(formatFileOperations([], ['/b.ts'])).toBe('\n\n<modified-files>\n/b.ts\n</modified-files>')
  })

  it('renders nothing when both lists are empty', () => {
    expect(formatFileOperations([], [])).toBe('')
  })
})

describe('extractFileOperations', () => {
  function priorCompaction(details: unknown, fromHook?: boolean): SessionEntry {
    return {
      type: 'compaction',
      id: 'c1',
      parentId: null,
      timestamp: '2025-01-01T00:00:00Z',
      summary: 'previous',
      firstKeptEntryId: 'u1',
      tokensBefore: 100,
      details,
      fromHook,
    }
  }

  it('inherits the file lists of the previous compaction', () => {
    const entries = [priorCompaction({ readFiles: ['/a.ts'], modifiedFiles: ['/b.ts'] })]
    const ops = extractFileOperations([], entries, 0)
    expect([...ops.read]).toEqual(['/a.ts'])
    expect([...ops.edited]).toEqual(['/b.ts'])
  })

  it('skips details written by an extension hook', () => {
    const entries = [priorCompaction({ readFiles: ['/a.ts'] }, true)]
    const ops = extractFileOperations([], entries, 0)
    expect([...ops.read]).toEqual([])
  })

  it('adds tool call paths from the messages being summarized', () => {
    const entries = [priorCompaction(undefined)]
    const messages = [assistantWithCalls([{ name: 'read', arguments: { path: '/new.ts' } }])]
    const ops = extractFileOperations(messages, entries, 0)
    expect([...ops.read]).toEqual(['/new.ts'])
  })

  it('tolerates a missing or malformed previous compaction', () => {
    expect([...extractFileOperations([], [], -1).read]).toEqual([])
    const broken = [priorCompaction({ readFiles: 'not-an-array' })]
    expect([...extractFileOperations([], broken, 0).read]).toEqual([])
  })
})
