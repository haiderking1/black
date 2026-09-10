import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '../backend/sessions/manager'
import { formatMissingSessionCwdError, getMissingSessionCwdIssue, MissingSessionCwdError, assertSessionCwdExists } from '../backend/sessions/cwd'

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

describe('missing session cwd detection', () => {
  it('flags persisted sessions whose stored cwd vanished', () => {
    const dir = mkdtempSync(join(tmpdir(), 'black-cwd-'))
    try {
      const session = SessionManager.create('/gone/project-' + Date.now(), dir)
      session.appendMessage(user('hello'))
      session.appendMessage(assistant('hi'))

      const issue = getMissingSessionCwdIssue(session, '/fallback')
      expect(issue).toBeDefined()
      expect(issue!.sessionFile).toBe(session.getSessionFile())
      expect(issue!.sessionCwd).toBe(session.getCwd())
      expect(issue!.fallbackCwd).toBe('/fallback')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes existing cwds and in-memory sessions', () => {
    const session = SessionManager.create(tmpdir())
    session.appendMessage(user('hello'))
    session.appendMessage(assistant('hi'))
    expect(getMissingSessionCwdIssue(session, '/fallback')).toBeUndefined()

    const memory = SessionManager.inMemory('/gone/nowhere')
    expect(getMissingSessionCwdIssue(memory, '/fallback')).toBeUndefined()
  })

  it('formats a useful error message', () => {
    const message = formatMissingSessionCwdError({
      sessionFile: '/sessions/x.jsonl',
      sessionCwd: '/old/project',
      fallbackCwd: '/new/project',
    })
    expect(message).toContain('/old/project')
    expect(message).toContain('Session file: /sessions/x.jsonl')
    expect(message).toContain('/new/project')
  })

  it('assertSessionCwdExists throws a typed error only for missing persisted cwds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'black-cwd-assert-'))
    try {
      const session = SessionManager.create('/gone/project-' + Date.now(), dir)
      session.appendMessage(user('hello'))
      session.appendMessage(assistant('hi'))

      expect(() => assertSessionCwdExists(session, '/fallback')).toThrow(MissingSessionCwdError)

      const memory = SessionManager.inMemory('/gone/nowhere')
      expect(() => assertSessionCwdExists(memory, '/fallback')).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
