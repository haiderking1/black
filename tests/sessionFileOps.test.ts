import { describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '../backend/sessions/manager'
import { findMostRecentSession } from '../backend/sessions/info'

function user(text: string, timestamp = Date.now()) {
  return { role: 'user' as const, content: text, timestamp }
}

function assistant(text: string, timestamp = Date.now()) {
  return {
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop' as const,
    timestamp,
  }
}

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('SessionManager file persistence', () => {
  it('defers file creation until the first assistant message', () => {
    const dir = tempDir('black-session-')
    try {
      const session = SessionManager.create('/proj', dir)
      const file = session.getSessionFile()
      expect(file).toBeDefined()
      expect(existsSync(file!)).toBe(false)

      session.appendMessage(user('hello'))
      expect(existsSync(file!)).toBe(false)

      session.appendMessage(assistant('hi'))
      expect(existsSync(file!)).toBe(true)

      const lines = readFileSync(file!, 'utf8').trim().split('\n')
      expect(lines).toHaveLength(3)
      expect(JSON.parse(lines[0]!).type).toBe('session')
      expect(JSON.parse(lines[1]!).message.role).toBe('user')
      expect(JSON.parse(lines[2]!).message.role).toBe('assistant')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('appends each new entry to the flushed file', () => {
    const dir = tempDir('black-session-')
    try {
      const session = SessionManager.create('/proj', dir)
      session.appendMessage(user('hello'))
      session.appendMessage(assistant('hi'))
      const file = session.getSessionFile()!
      session.appendModelChange('openai', 'gpt-test')

      const lines = readFileSync(file, 'utf8').trim().split('\n')
      expect(lines).toHaveLength(4)
      expect(JSON.parse(lines[3]!).type).toBe('model_change')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rewrites the file when migration changes entries on open', () => {
    const dir = tempDir('black-session-')
    try {
      const file = join(dir, 'v1.jsonl')
      const msgLine = JSON.stringify({
        type: 'message',
        timestamp: '2025-01-01T00:00:01Z',
        message: { role: 'user', content: 'hi', timestamp: 1 },
      })
      writeFileSync(file, JSON.stringify({ type: 'session', id: 'sess-1', timestamp: '2025-01-01T00:00:00Z', cwd: '/tmp' }) + '\n' + msgLine + '\n')

      const session = SessionManager.open(file, dir)
      expect(session.getHeader()!.version).toBe(3)
      expect((session.getEntries()[0] as { id: string }).id).toBeDefined()
      expect((session.getEntries()[0] as { parentId: string | null }).parentId).toBeNull()

      const migratedLines = readFileSync(file, 'utf8').trim().split('\n')
      expect(migratedLines).toHaveLength(2)
      expect(JSON.parse(migratedLines[1]!).id).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a non-session file without modifying it', () => {
    const dir = tempDir('black-session-')
    try {
      const file = join(dir, 'not-a-session.log')
      const original = '{"type":"event","data":"not a session"}\n'
      writeFileSync(file, original)

      expect(() => SessionManager.open(file)).toThrow('Session file is not a valid black session')
      expect(readFileSync(file, 'utf8')).toBe(original)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('repairs an empty file opened as a session', () => {
    const dir = tempDir('black-session-')
    try {
      const file = join(dir, 'empty.jsonl')
      writeFileSync(file, '')

      const session = SessionManager.open(file, dir)
      expect(session.getSessionId()).toMatch(/^[0-9a-f-]{36}$/)
      const raw = readFileSync(file, 'utf8')
      expect(raw.endsWith('\n')).toBe(true)
      expect(JSON.parse(raw.trim()).type).toBe('session')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('opens sessions beyond the discovery scan limit via a full load', () => {
    const dir = tempDir('black-session-')
    try {
      const file = join(dir, 'large-id.jsonl')
      const storedCwd = join(dir, 'stored-project')
      const bigId = 'a'.repeat(1024 * 1024 + 1)
      writeFileSync(
        file,
        JSON.stringify({ type: 'session', version: 3, id: bigId, timestamp: '2025-01-01T00:00:00Z', cwd: storedCwd }) + '\n',
      )

      const overrideCwd = join(dir, 'override-project')
      for (const cwdOverride of [undefined, overrideCwd]) {
        const session = SessionManager.open(file, dir, cwdOverride)
        expect(session.getSessionId()).toBe(bigId)
        expect(session.getCwd()).toBe(cwdOverride ?? storedCwd)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('starts a fresh session at an explicit path that does not exist yet', () => {
    const dir = tempDir('black-session-')
    try {
      const file = join(dir, 'brand-new.jsonl')
      const session = SessionManager.open(file, dir)
      expect(session.getSessionId()).toMatch(/^[0-9a-f-]{36}$/)
      expect(existsSync(file)).toBe(false)

      session.appendMessage(user('hello'))
      session.appendMessage(assistant('hi'))
      expect(existsSync(file)).toBe(true)
      expect(JSON.parse(readFileSync(file, 'utf8').trim().split('\n')[0]!).cwd).toBe(session.getCwd())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('continueRecent opens the newest session or creates a new one', async () => {
    const dir = tempDir('black-continue-')
    try {
      const older = SessionManager.create('/proj', dir)
      older.appendMessage(user('older'))
      older.appendMessage(assistant('older reply'))
      await new Promise((resolve) => setTimeout(resolve, 15))

      const newer = SessionManager.create('/proj', dir)
      newer.appendMessage(user('newer'))
      newer.appendMessage(assistant('newer reply'))

      const resumed = SessionManager.continueRecent('/proj', dir)
      expect(resumed.getSessionId()).toBe(newer.getSessionId())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }

    const empty = tempDir('black-continue-empty-')
    try {
      const fresh = SessionManager.continueRecent('/other', empty)
      expect(fresh.getSessionId()).toMatch(/^[0-9a-f-]{36}$/)
      expect(fresh.getEntries()).toEqual([])
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('lists sessions for a directory newest first', async () => {
    const dir = tempDir('black-list-')
    const projectDir = join(dir, 'project')
    mkdirSync(projectDir, { recursive: true })
    try {
      const first = SessionManager.create(projectDir, dir)
      first.appendMessage(user('first'))
      first.appendMessage(assistant('first reply'))
      await new Promise((resolve) => setTimeout(resolve, 10))

      const second = SessionManager.create(projectDir, dir)
      second.appendMessage(user('second'))
      second.appendMessage(assistant('second reply'))

      const sessions = await SessionManager.list(projectDir, dir)
      expect(sessions).toHaveLength(2)
      expect(sessions[0]!.id).toBe(second.getSessionId())
      expect(sessions[0]!.messageCount).toBe(2)
      expect(sessions[0]!.firstMessage).toBe('second')
      expect(sessions[0]!.cwd).toBe(projectDir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('finds the most recent session filtered by cwd', async () => {
    const dir = tempDir('black-recent-')
    try {
      const projectA = join(dir, 'project-a')
      const projectB = join(dir, 'project-b')
      const fileA = join(dir, 'a.jsonl')
      const fileB = join(dir, 'b.jsonl')

      writeFileSync(fileA, JSON.stringify({ type: 'session', id: 'a', timestamp: '2025-01-01T00:00:00Z', cwd: projectA }) + '\n')
      await new Promise((resolve) => setTimeout(resolve, 10))
      writeFileSync(fileB, JSON.stringify({ type: 'session', id: 'b', timestamp: '2025-01-01T00:00:00Z', cwd: projectB }) + '\n')

      expect(findMostRecentSession(dir, projectA)).toBe(fileA)
      expect(findMostRecentSession(dir, projectB)).toBe(fileB)
      expect(findMostRecentSession(dir)).toBe(fileB)
      expect(findMostRecentSession(dir, join(dir, 'missing'))).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips corrupted files when listing and finding recent sessions', async () => {
    const dir = tempDir('black-corrupt-')
    try {
      const good = join(dir, 'good.jsonl')
      writeFileSync(good, JSON.stringify({ type: 'session', id: 'good', timestamp: '2025-01-01T00:00:00Z', cwd: '/proj' }) + '\n')
      writeFileSync(join(dir, 'corrupt.jsonl'), 'this is not a session\n')

      const sessions = await SessionManager.list('/proj', dir)
      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.id).toBe('good')

      expect(findMostRecentSession(dir, '/proj')).toBe(good)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
});
