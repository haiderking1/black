import { describe, expect, it } from 'bun:test'
import os from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  encodeCwdToDirName,
  getDefaultSessionDir,
  getDefaultSessionDirPath,
  getDefaultSessionsParentDir,
  normalizePath,
  resolvePath,
  sessionFileName,
} from '../backend/sessions/paths'

describe('encodeCwdToDirName', () => {
  it('encodes an absolute unix path into a dashed folder name', () => {
    expect(encodeCwdToDirName('/home/soka/black')).toBe('--home-soka-black--')
  })

  it('collapses separators and colons for windows drives', () => {
    // Only /, backslash, and colon are replaced; spaces survive.
    expect(encodeCwdToDirName('C:\\work\\my proj')).toBe('--C--work-my proj--')
  })

  it('keeps relative paths intact apart from separators', () => {
    expect(encodeCwdToDirName('relative/path')).toBe('--relative-path--')
  })
})

describe('normalizePath', () => {
  it('expands the bare home marker', () => {
    expect(normalizePath('~')).toBe(os.homedir())
  })

  it('expands tilde paths into the home directory', () => {
    expect(normalizePath('~/code/black')).toBe(join(os.homedir(), 'code', 'black'))
  })

  it('converts file URLs on the current platform', () => {
    const converted = normalizePath('file:///tmp/some%20dir')
    expect(isAbsolute(converted)).toBe(true)
    expect(converted).toContain('some dir')
  })

  it('normalizes unicode spaces when asked', () => {
    expect(normalizePath('/a\u00A0b', { normalizeUnicodeSpaces: true })).toBe('/a b')
  })

  it('leaves ordinary paths untouched', () => {
    expect(normalizePath('/opt/data')).toBe('/opt/data')
  })
})

describe('resolvePath', () => {
  it('returns absolute inputs unchanged apart from normalization', () => {
    expect(resolvePath('/tmp/x/../y')).toBe('/tmp/y')
  })

  it('resolves relative paths against the base dir', () => {
    expect(resolvePath('a/b', '/base')).toBe('/base/a/b')
  })

  it('defaults the base to the process cwd', () => {
    expect(isAbsolute(resolvePath('a'))).toBe(true)
  })
})

describe('session directories', () => {
  it('builds the encoded directory path without creating it', () => {
    const agentDir = '/tmp/black-agent-test'
    const path = getDefaultSessionDirPath('/proj/a', agentDir)
    expect(path).toBe(join(agentDir, 'sessions', '--proj-a--'))
  })

  it('creates the directory on demand and is idempotent', () => {
    const agentDir = join(os.tmpdir(), 'black-agent-test-' + Date.now())
    const dir = getDefaultSessionDir('/proj/b', agentDir)
    expect(dir).toBe(join(agentDir, 'sessions', '--proj-b--'))
    const again = getDefaultSessionDir('/proj/b', agentDir)
    expect(dir).toBe(dir)
    expect(dir).toBe(join(agentDir, 'sessions', '--proj-b--'))
  })

  it('names the sessions parent after the agent dir', () => {
    expect(getDefaultSessionsParentDir('/agent')).toBe(join('/agent', 'sessions'))
  })
})

describe('sessionFileName', () => {
  it('replaces colon and dot characters from iso timestamps', () => {
    const name = sessionFileName('2026-01-01T00:00:00.000Z', 'sess-1')
    expect(name).toBe('2026-01-01T00-00-00-000Z_sess-1.jsonl')
  })
})
