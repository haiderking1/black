import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager, type AppendableMessage } from '../backend/sessions/manager'
import { buildSessionContext } from '../backend/sessions/context'
import type { FileEntry, SessionEntry, SessionMessageEntry } from '../backend/sessions/types'

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function userMessage(text: string, timestamp = Date.now()) {
  return { role: 'user' as const, content: text, timestamp }
}

function assistantMessage(text: string, timestamp = Date.now()) {
  return {
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-test',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop' as const,
    timestamp,
  }
}

function storedEntries(build: (source: SessionManager) => void): SessionEntry[] {
  const source = SessionManager.inMemory('/project')
  build(source)
  return source.getEntries()
}

describe('SessionManager.inMemory', () => {
  it('adopts preloaded entries verbatim', () => {
    const entries = storedEntries((source) => {
      source.appendMessage(userMessage('hello'))
      source.appendModelChange('anthropic', 'claude-opus-4-5')
      source.appendMessage(userMessage('again'))
    })

    const session = SessionManager.inMemory('/project', undefined, entries)
    expect(session.getEntries()).toEqual(entries)
  })

  it('keeps the loaded leaf so appends continue the conversation', () => {
    const entries = storedEntries((source) => {
      source.appendMessage(userMessage('hello'))
      source.appendMessage(userMessage('again'))
    })
    const lastId = entries[entries.length - 1]!.id

    const session = SessionManager.inMemory('/project', undefined, entries)
    const appendedId = session.appendMessage(userMessage('continued'))

    expect(session.getLeafId()).toBe(appendedId)
    expect(session.getEntry(appendedId)!.parentId).toBe(lastId)
  })

  it('never mints an id that collides with a loaded entry', () => {
    const entries = storedEntries((source) => {
      for (let i = 0; i < 50; i++) source.appendMessage(userMessage('message ' + i))
    })

    const session = SessionManager.inMemory('/project', undefined, entries)
    const appendedId = session.appendMessage(userMessage('continued'))

    expect(entries.some((entry) => entry.id === appendedId)).toBe(false)
  })

  it('rebuilds labels', () => {
    let labelledId = ''
    const entries = storedEntries((source) => {
      labelledId = source.appendMessage(userMessage('hello'))
      source.appendLabelChange(labelledId, 'checkpoint')
    })

    const session = SessionManager.inMemory('/project', undefined, entries)
    expect(session.getLabel(labelledId)).toBe('checkpoint')
  })

  it('resolves a compaction against the entry it was written against', () => {
    let keptId = ''
    const entries = storedEntries((source) => {
      source.appendMessage(userMessage('dropped'))
      keptId = source.appendMessage(userMessage('kept'))
      source.appendCompaction('summary so far', keptId, 1000)
    })

    const session = SessionManager.inMemory('/project', undefined, entries)
    const context = session.getContextEntries()
    expect(context.some((entry) => entry.id === keptId)).toBe(true)
  })

  it('creates a header from the options when the entries carry none', () => {
    const entries = storedEntries((source) => source.appendMessage(userMessage('hello')))
    const session = SessionManager.inMemory('/project', { id: 'restored-session' }, entries)

    expect(session.getSessionId()).toBe('restored-session')
    expect(session.getHeader()!.id).toBe('restored-session')
    expect(session.getHeader()!.cwd).toBe('/project')
  })

  it('generates a uuidv7 session id when the options carry none', () => {
    const entries = storedEntries((source) => source.appendMessage(userMessage('hello')))
    const session = SessionManager.inMemory('/project', undefined, entries)

    expect(session.getSessionId()).toMatch(UUID_V7_RE)
    expect(session.getHeader()!.id).toBe(session.getSessionId())
  })

  it('stays off the filesystem', () => {
    const entries = storedEntries((source) => source.appendMessage(userMessage('hello')))
    const session = SessionManager.inMemory('/project', undefined, entries)
    session.appendMessage(userMessage('continued'))

    expect(session.getSessionFile()).toBeUndefined()
    expect(session.isPersisted()).toBe(false)
  })

  it('starts an empty session when the entries are empty', () => {
    const session = SessionManager.inMemory('/project', { id: 'empty-session' }, [])

    expect(session.getSessionId()).toBe('empty-session')
    expect(session.getEntries()).toEqual([])
    expect(session.getLeafId()).toBeNull()
  })

  it('takes session identity from a header among the entries', () => {
    const body = storedEntries((source) => source.appendMessage(userMessage('hello')))
    const entries: FileEntry[] = [
      { type: 'session', version: 3, id: 'stored-session', timestamp: '2026-01-01T00:00:00Z', cwd: '/stored' },
      ...body,
    ]

    const session = SessionManager.inMemory('/project', { id: 'ignored' }, entries)

    expect(session.getSessionId()).toBe('stored-session')
    expect(session.getHeader()!.cwd).toBe('/stored')
  })

  it('migrates entries restored with an older header', () => {
    const entries: FileEntry[] = [
      { type: 'session', version: 2, id: 'v2-session', timestamp: '2026-01-01T00:00:00Z', cwd: '/project' },
      {
        type: 'message',
        id: 'abc12345',
        parentId: null,
        timestamp: '2026-01-01T00:00:01Z',
        message: { role: 'hookMessage', content: 'from a hook', timestamp: 1 },
      },
    ] as unknown as FileEntry[]

    const session = SessionManager.inMemory('/project', undefined, entries)
    const restored = session.getEntries()[0] as SessionMessageEntry

    expect(session.getHeader()!.version).toBe(3)
    expect(restored.message.role).toBe('custom')
    expect(restored.id).toBe('abc12345')
  })

  it('adopts headerless entries as current-version without migrating them', () => {
    const entries: SessionEntry[] = [
      {
        type: 'message',
        id: 'abc12345',
        parentId: null,
        timestamp: '2026-01-01T00:00:01Z',
        message: { role: 'hookMessage', content: 'from a hook', timestamp: 1 },
      } as unknown as SessionMessageEntry,
    ]

    const session = SessionManager.inMemory('/project', undefined, entries)
    const restored = session.getEntries()[0] as SessionMessageEntry
    expect(restored.message.role as string).toBe('hookMessage')
  })
})

describe('SessionManager appends', () => {
  it('chains entries linearly through parentId', () => {
    const session = SessionManager.inMemory()
    const a = session.appendMessage(userMessage('first'))
    const b = session.appendThinkingLevelChange('high')
    const c = session.appendModelChange('openai', 'gpt-test')
    const d = session.appendMessage(userMessage('second'))

    expect(session.getEntry(b)!.parentId).toBe(a)
    expect(session.getEntry(c)!.parentId).toBe(b)
    expect(session.getEntry(d)!.parentId).toBe(c)
    expect(session.getLeafId()).toBe(d)
  })

  it('advances the leaf after every append type', () => {
    const session = SessionManager.inMemory()
    const a = session.appendMessage(userMessage('hi'))
    const customId = session.appendCustomEntry('my_data', { foo: 'bar' })
    const customMsgId = session.appendCustomMessageEntry('inject', 'context', true)
    const infoId = session.appendSessionInfo('Named session')
    const labelId = session.appendLabelChange(a, 'checkpoint')
    const compactionId = session.appendCompaction('old stuff', a, 500)

    expect(session.getEntries()).toHaveLength(6)
    expect(session.getEntry(customId)!.parentId).toBe(a)
    expect(session.getEntry(customMsgId)!.parentId).toBe(customId)
    expect(session.getLeafId()).toBe(compactionId)
    expect(infoId).toBeDefined()
    expect(labelId).toBeDefined()
  })

  it('throws when labeling a non-existent entry', () => {
    const session = SessionManager.inMemory()
    expect(() => session.appendLabelChange('non-existent', 'label')).toThrow('Entry non-existent not found')
  })

  it('sets, replaces, and clears labels', () => {
    const session = SessionManager.inMemory()
    const msgId = session.appendMessage(userMessage('hello'))

    expect(session.getLabel(msgId)).toBeUndefined()
    session.appendLabelChange(msgId, 'checkpoint')
    expect(session.getLabel(msgId)).toBe('checkpoint')
    expect(session.getLabelTimestamp(msgId)).toBeDefined()

    session.appendLabelChange(msgId, 'second')
    expect(session.getLabel(msgId)).toBe('second')

    session.appendLabelChange(msgId, undefined)
    expect(session.getLabel(msgId)).toBeUndefined()

    session.appendLabelChange(msgId, 'again')
    session.appendLabelChange(msgId, '')
    expect(session.getLabel(msgId)).toBeUndefined()
  })

  it('resolves the session name from the latest session_info entry, including clears', () => {
    const session = SessionManager.inMemory()
    session.appendMessage(userMessage('hi'))
    expect(session.getSessionName()).toBeUndefined()

    session.appendSessionInfo('Refactor auth module')
    expect(session.getSessionName()).toBe('Refactor auth module')

    session.appendSessionInfo('  renamed  ')
    expect(session.getSessionName()).toBe('renamed')

    session.appendSessionInfo('')
    expect(session.getSessionName()).toBeUndefined()
  })

  it('strips newlines from session names', () => {
    const session = SessionManager.inMemory()
    session.appendSessionInfo('multi\nline\rname')
    expect(session.getSessionName()).toBe('multi line name')
  })

  it('excludes custom entries and labels from context messages', () => {
    const session = SessionManager.inMemory()
    const msgId = session.appendMessage(userMessage('hello'))
    session.appendCustomEntry('state', { count: 1 })
    session.appendLabelChange(msgId, 'mark')
    session.appendMessage(assistantMessage('hi'))

    const ctx = session.buildSessionContext()
    expect(ctx.messages).toHaveLength(2)
    expect(ctx.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('tracks thinking level and model from the path', () => {
    const session = SessionManager.inMemory()
    session.appendMessage(userMessage('hello'))
    session.appendThinkingLevelChange('high')
    session.appendMessage(assistantMessage('thinking hard'))

    let ctx = session.buildSessionContext()
    expect(ctx.thinkingLevel).toBe('high')

    session.appendModelChange('openai', 'gpt-test')
    ctx = session.buildSessionContext()
    expect(ctx.model).toEqual({ provider: 'openai', modelId: 'gpt-test' })

    session.appendMessage(assistantMessage('again'))
    ctx = session.buildSessionContext()
    expect(ctx.model).toEqual({ provider: 'anthropic', modelId: 'claude-test' })
  })

  it('repairs null content in stored messages', () => {
    const session = SessionManager.inMemory('/p', undefined, [
      {
        type: 'message',
        id: 'm1',
        parentId: null,
        timestamp: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: null, timestamp: 1 },
      } as unknown as SessionMessageEntry,
    ])

    const ctx = session.buildSessionContext()
    expect(ctx.messages).toEqual([{ role: 'user', content: [], timestamp: 1 }])
  })

  it('converts compaction entries to compaction summary messages', () => {
    const session = SessionManager.inMemory()
    session.appendMessage(userMessage('a'))
    // Keeping from the leaf means the user message survives the cut.
    session.appendCompaction('summary text', session.getLeafId()!, 100)

    const ctx = session.buildSessionContext()
    expect(ctx.messages).toHaveLength(2)
    expect(ctx.messages[0]!.role).toBe('compactionSummary')
    expect(ctx.messages[1]!.role).toBe('user')
  })

  it('includes custom_message entries in context but plain custom entries never', () => {
    const session = SessionManager.inMemory()
    session.appendMessage(userMessage('a'))
    session.appendCustomEntry('hidden-state', { x: 1 })
    session.appendCustomMessageEntry('inject', 'injected', true)

    const ctx = session.buildSessionContext()
    expect(ctx.messages.map((m) => m.role)).toEqual(['user', 'custom'])
  })

  it('returns empty context for empty entries', () => {
    const ctx = SessionManager.inMemory().buildSessionContext()
    expect(ctx.messages).toEqual([])
    expect(ctx.thinkingLevel).toBe('off')
    expect(ctx.model).toBeNull()
  })

  it('supports custom session ids with interior punctuation and rejects bad ones', () => {
    const session = SessionManager.inMemory()
    session.newSession({ id: 'abc-123_def.456' })
    expect(session.getSessionId()).toBe('abc-123_def.456')

    const invalid = ['', '-abc', 'abc-', '_abc', '.abc', 'abc.', 'abc/def', 'abc def']
    for (const id of invalid) {
      expect(() => session.newSession({ id })).toThrow('Session id must be non-empty')
    }
  })

  it('generates a uuidv7 when options carry only parentSession', () => {
    const session = SessionManager.inMemory()
    session.newSession({ parentSession: 'parent.jsonl' })
    expect(session.getSessionId()).toMatch(UUID_V7_RE)
  })
})

describe('SessionManager compaction context', () => {
  it('includes the summary before the kept messages', () => {
    const entries: SessionEntry[] = [
      msg('1', null, 'user', 'first'),
      msg('2', '1', 'assistant', 'response1'),
      msg('3', '2', 'user', 'second'),
      msg('4', '3', 'assistant', 'response2'),
      { type: 'compaction', id: '5', parentId: '4', timestamp: '2025-01-01T00:00:00Z', summary: 'Summary of first two turns', firstKeptEntryId: '3', tokensBefore: 1000 },
      msg('6', '5', 'user', 'third'),
      msg('7', '6', 'assistant', 'response3'),
    ]
    const ctx = buildSessionContext(entries)

    expect(ctx.messages).toHaveLength(5)
    expect((ctx.messages[0] as { summary: string }).summary).toContain('Summary of first two turns')
    expect((ctx.messages[1] as { content: string }).content).toBe('second')
    expect((ctx.messages[3] as { content: string }).content).toBe('third')
  })

  it('handles compaction keeping from the first message', () => {
    const entries: SessionEntry[] = [
      msg('1', null, 'user', 'first'),
      msg('2', '1', 'assistant', 'response'),
      { type: 'compaction', id: '3', parentId: '2', timestamp: '2025-01-01T00:00:00Z', summary: 'Empty summary', firstKeptEntryId: '1', tokensBefore: 1000 },
      msg('4', '3', 'user', 'second'),
    ]
    expect(buildSessionContext(entries).messages).toHaveLength(4)
  })

  it('uses the latest compaction', () => {
    const entries: SessionEntry[] = [
      msg('1', null, 'user', 'a'),
      msg('2', '1', 'assistant', 'b'),
      { type: 'compaction', id: '3', parentId: '2', timestamp: '2025-01-01T00:00:00Z', summary: 'First', firstKeptEntryId: '1', tokensBefore: 1000 },
      msg('4', '3', 'user', 'c'),
      msg('5', '4', 'assistant', 'd'),
      { type: 'compaction', id: '6', parentId: '5', timestamp: '2025-01-01T00:00:00Z', summary: 'Second', firstKeptEntryId: '4', tokensBefore: 2000 },
      msg('7', '6', 'user', 'e'),
    ]
    const ctx = buildSessionContext(entries)
    expect(ctx.messages).toHaveLength(4)
    expect((ctx.messages[0] as { summary: string }).summary).toContain('Second')
  })

  it('treats a compaction with retainedTail as a self-contained checkpoint', () => {
    const entries: SessionEntry[] = [
      msg('1', null, 'user', 'ancient'),
      msg('2', '1', 'assistant', 'older'),
      {
        type: 'compaction',
        id: '3',
        parentId: '2',
        timestamp: '2025-01-01T00:00:00Z',
        summary: 'Checkpoint',
        firstKeptEntryId: '1',
        tokensBefore: 1000,
        retainedTail: [userMessage('retained', 5)],
      },
      msg('4', '3', 'user', 'after'),
    ]
    const ctx = buildSessionContext(entries)

    expect(ctx.messages).toHaveLength(3)
    expect((ctx.messages[0] as { summary: string }).summary).toContain('Checkpoint')
    expect((ctx.messages[1] as { content: string }).content).toBe('retained')
    expect((ctx.messages[2] as { content: string }).content).toBe('after')
  })

  it('drops error and aborted assistant messages from retainedTail', () => {
    const entries: SessionEntry[] = [
      {
        type: 'compaction',
        id: '1',
        parentId: null,
        timestamp: '2025-01-01T00:00:00Z',
        summary: 'S',
        firstKeptEntryId: '1',
        tokensBefore: 10,
        retainedTail: [
          { ...assistantMessage('failed'), stopReason: 'error' as const },
          userMessage('kept', 6),
        ],
      },
    ]
    const ctx = buildSessionContext(entries)
    expect(ctx.messages.map((m) => m.role)).toEqual(['compactionSummary', 'user'])
  })

  it('keeps settings from the full path after compaction', () => {
    const entries: SessionEntry[] = [
      msg('1', null, 'user', 'first'),
      { type: 'thinking_level_change', id: '2', parentId: '1', timestamp: '2025-01-01T00:00:00Z', thinkingLevel: 'high' },
      msg('3', '2', 'assistant', 'response1'),
      msg('4', '3', 'user', 'second'),
      { type: 'compaction', id: '5', parentId: '4', timestamp: '2025-01-01T00:00:00Z', summary: 'S', firstKeptEntryId: '4', tokensBefore: 100 },
    ]
    const ctx = buildSessionContext(entries)
    expect(ctx.thinkingLevel).toBe('high')
    expect(ctx.messages.map((m) => m.role)).toEqual(['compactionSummary', 'user'])
  })

  it('orphan parents stop the walk instead of crashing', () => {
    const entries: SessionEntry[] = [
      msg('1', null, 'user', 'root'),
      msg('2', 'missing-parent', 'user', 'orphaned'),
    ]
    const rootCtx = buildSessionContext(entries, '1')
    expect(rootCtx.messages.map((m) => (m as { content: string }).content)).toEqual(['root'])

    // Walking from the orphan entry stops at the broken link.
    const orphanCtx = buildSessionContext(entries, '2')
    expect(orphanCtx.messages.map((m) => (m as { content: string }).content)).toEqual(['orphaned'])
  })
})

function msg(id: string, parentId: string | null, role: 'user' | 'assistant', text: string): SessionMessageEntry {
  const base = { type: 'message' as const, id, parentId, timestamp: '2025-01-01T00:00:00Z' }
  if (role === 'user') return { ...base, message: { role, content: text, timestamp: 1 } }
  return {
    ...base,
    message: {
      role,
      content: [{ type: 'text', text }],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'claude-test',
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop',
      timestamp: 1,
    },
  }
}
