import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { acquireFileLock, FileSettingsStorage, InMemorySettingsStorage } from '../backend/config'

describe('FileSettingsStorage', () => {
  let root: string
  let agentDir: string
  let projectDir: string
  let storage: FileSettingsStorage

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'black-storage-'))
    agentDir = join(root, 'agent')
    projectDir = join(root, 'project')
    mkdirSync(agentDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    storage = new FileSettingsStorage(projectDir, agentDir)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reads nothing and writes nothing when the file does not exist', () => {
    let seen: string | undefined = 'sentinel'
    storage.withLock('global', (current) => {
      seen = current
      return undefined
    })
    expect(seen).toBeUndefined()
    expect(existsSync(join(agentDir, 'settings.json'))).toBe(false)
  })

  it('round-trips content written through the lock', () => {
    storage.withLock('global', () => JSON.stringify({ theme: 'dark' }))
    let readBack: string | undefined
    storage.withLock('global', (current) => {
      readBack = current
      return undefined
    })
    expect(JSON.parse(readBack as string)).toEqual({ theme: 'dark' })
  })

  it('does not create the project config dir when only reading', () => {
    storage.withLock('project', () => undefined)
    expect(existsSync(join(projectDir, '.black'))).toBe(false)
  })

  it('creates the project config dir on first project write', () => {
    storage.withLock('project', () => JSON.stringify({ theme: 'light' }))
    expect(JSON.parse(readFileSync(join(projectDir, '.black', 'settings.json'), 'utf-8'))).toEqual({ theme: 'light' })
  })

  it('serializes writers through the lock file', () => {
    const lockPath = join(agentDir, 'settings.json.lock')
    mkdirSync(lockPath)
    expect(() => {
      storage.withLock('global', () => JSON.stringify({ a: 1 }))
    }).toThrow()
    rmSync(lockPath, { recursive: true, force: true })
    storage.withLock('global', () => JSON.stringify({ a: 1 }))
    expect(JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf-8'))).toEqual({ a: 1 })
  })
})

describe('InMemorySettingsStorage', () => {
  it('stores scopes independently and skips undefined results', () => {
    const storage = new InMemorySettingsStorage()
    let seen: string | undefined = 'sentinel'
    storage.withLock('global', (current) => {
      seen = current
      return JSON.stringify({ scope: 'global' })
    })
    expect(seen).toBeUndefined()
    storage.withLock('project', () => JSON.stringify({ scope: 'project' }))
    let globalValue: string | undefined
    let projectValue: string | undefined
    storage.withLock('global', (current) => {
      globalValue = current
      return undefined
    })
    storage.withLock('project', (current) => {
      projectValue = current
      return undefined
    })
    expect(JSON.parse(globalValue as string)).toEqual({ scope: 'global' })
    expect(JSON.parse(projectValue as string)).toEqual({ scope: 'project' })
  })
})

describe('acquireFileLock', () => {
  let root: string
  let target: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'black-lock-'))
    target = join(root, 'settings.json')
    writeFileSync(target, '{}')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('creates and removes a lock directory next to the target', () => {
    const lock = acquireFileLock(target)
    expect(existsSync(target + '.lock')).toBe(true)
    lock.release()
    expect(existsSync(target + '.lock')).toBe(false)
  })

  it('fails fast when another holder refuses to release', () => {
    const holder = acquireFileLock(target)
    try {
      expect(() => acquireFileLock(target, { maxAttempts: 2, retryDelayMs: 1 })).toThrow()
    } finally {
      holder.release()
    }
  })

  it('takes over a stale lock left by a crashed process', () => {
    const lockPath = target + '.lock'
    mkdirSync(lockPath)
    const staleTime = new Date(Date.now() - 60_000)
    utimesSync(lockPath, staleTime, staleTime)
    const lock = acquireFileLock(target, { maxAttempts: 3, retryDelayMs: 1, staleMs: 1000 })
    expect(existsSync(lockPath)).toBe(true)
    lock.release()
  })

  it('re-acquires cleanly after the previous holder releases', () => {
    const holder = acquireFileLock(target)
    holder.release()
    const next = acquireFileLock(target, { maxAttempts: 5, retryDelayMs: 1, staleMs: 60_000 })
    next.release()
    expect(existsSync(target + '.lock')).toBe(false)
  })
})
