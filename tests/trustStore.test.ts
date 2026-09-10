import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  ProjectTrustStore,
  getProjectTrustOptions,
  getProjectTrustParentPath,
  hasTrustRequiringProjectResources,
} from '../backend/config'

describe('ProjectTrustStore', () => {
  let root: string
  let agentDir: string
  let cwd: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'black-trust-'))
    agentDir = join(root, 'agent')
    cwd = join(root, 'project')
    mkdirSync(agentDir, { recursive: true })
    mkdirSync(cwd, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('stores decisions and inherits them from parent directories', () => {
    const store = new ProjectTrustStore(agentDir)
    const parentDir = join(root, 'trusted-parent')
    const childDir = join(parentDir, 'sub-project')
    mkdirSync(childDir, { recursive: true })

    expect(store.get(childDir)).toBeNull()
    store.set(parentDir, true)
    expect(store.get(childDir)).toBe(true)
    store.set(childDir, false)
    expect(store.get(childDir)).toBe(false)

    // A null decision clears the exact entry; the parent decision applies again.
    store.set(childDir, null)
    expect(store.get(childDir)).toBe(true)
  })

  it('records the exact entry path that matched', () => {
    const store = new ProjectTrustStore(agentDir)
    const parentDir = join(root, 'trusted-parent')
    const childDir = join(parentDir, 'sub-project')
    mkdirSync(childDir, { recursive: true })
    store.set(parentDir, true)

    const entry = store.getEntry(childDir)
    expect(entry?.path).toBe(parentDir)
    expect(entry?.decision).toBe(true)
  })

  it('writes sorted keys with a trailing newline', () => {
    const store = new ProjectTrustStore(agentDir)
    const a = join(root, 'aaa')
    const z = join(root, 'zzz')
    store.set(z, true)
    store.set(a, false)

    const raw = readFileSync(join(agentDir, 'trust.json'), 'utf-8')
    expect(raw.endsWith(String.fromCharCode(10))).toBe(true)
    const keys = Object.keys(JSON.parse(raw) as Record<string, unknown>)
    expect(keys).toEqual([...keys].sort())
    expect(keys[0]).toBe(a)
  })

  it('rejects malformed trust stores instead of guessing', () => {
    const store = new ProjectTrustStore(agentDir)
    const trustPath = join(agentDir, 'trust.json')
    writeFileSync(trustPath, '{ not json')
    expect(() => store.get(cwd)).toThrow('Failed to read trust store')

    writeFileSync(trustPath, JSON.stringify({ [cwd]: 'yes' }))
    expect(() => store.get(cwd)).toThrow('must be true, false, or null')

    writeFileSync(trustPath, JSON.stringify([true]))
    expect(() => store.get(cwd)).toThrow('expected an object')
  })

  it('applies many updates in one locked pass', () => {
    const store = new ProjectTrustStore(agentDir)
    const other = join(root, 'other')
    store.setMany([
      { path: cwd, decision: true },
      { path: other, decision: false },
    ])
    expect(store.get(cwd)).toBe(true)
    expect(store.get(other)).toBe(false)
  })
})

describe('getProjectTrustOptions', () => {
  it('offers trust, trust-parent, and deny batches', () => {
    const cwd = '/tmp/some-project'
    const options = getProjectTrustOptions(cwd)
    expect(options).toHaveLength(3)
    expect(options[0]?.label).toBe('Trust')
    expect(options[0]?.updates).toEqual([{ path: cwd, decision: true }])
    expect(options[1]?.label).toBe('Trust parent folder (/tmp)')
    expect(options[1]?.updates).toEqual([
      { path: '/tmp', decision: true },
      { path: cwd, decision: null },
    ])
    expect(options[2]?.label).toBe('Do not trust')
  })

  it('adds session-only choices when requested', () => {
    const options = getProjectTrustOptions('/tmp/some-project', { includeSessionOnly: true })
    expect(options).toHaveLength(5)
    expect(options[2]?.label).toBe('Trust (this session only)')
    expect(options[2]?.updates).toEqual([])
    expect(options[4]?.label).toBe('Do not trust (this session only)')
  })

  it('reports no parent for the filesystem root', () => {
    expect(getProjectTrustParentPath('/')).toBeUndefined()
  })
})

describe('hasTrustRequiringProjectResources', () => {
  let root: string
  let originalHome: string | undefined

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'black-trust-res-'))
    originalHome = process.env['HOME']
    process.env['HOME'] = root
  })

  afterEach(() => {
    if (originalHome === undefined) delete process.env['HOME']
    else process.env['HOME'] = originalHome
    rmSync(root, { recursive: true, force: true })
  })

  it('returns false for a bare directory', () => {
    const project = join(root, 'project')
    mkdirSync(project, { recursive: true })
    expect(hasTrustRequiringProjectResources(project)).toBe(false)
  })

  it('flags project config resources under .black', () => {
    const project = join(root, 'project')
    const configDir = join(project, '.black')
    mkdirSync(configDir, { recursive: true })
    expect(hasTrustRequiringProjectResources(project)).toBe(false)

    writeFileSync(join(configDir, 'settings.json'), '{}')
    expect(hasTrustRequiringProjectResources(project)).toBe(true)

    rmSync(join(configDir, 'settings.json'), { force: true })
    mkdirSync(join(configDir, 'skills'), { recursive: true })
    expect(hasTrustRequiringProjectResources(project)).toBe(true)
  })

  it('flags .agents/skills in the project but not the home directory', () => {
    // The user-level skills dir is trusted by definition.
    mkdirSync(join(root, '.agents', 'skills'), { recursive: true })
    expect(hasTrustRequiringProjectResources(root)).toBe(false)

    const project = join(root, 'project')
    mkdirSync(join(project, '.agents', 'skills'), { recursive: true })
    expect(hasTrustRequiringProjectResources(project)).toBe(true)
  })

  it('flags .agents/skills found in an ancestor of the project', () => {
    const parent = join(root, 'workspace')
    const project = join(parent, 'sub-project')
    mkdirSync(join(parent, '.agents', 'skills'), { recursive: true })
    mkdirSync(project, { recursive: true })
    expect(hasTrustRequiringProjectResources(project)).toBe(true)
  })
})
