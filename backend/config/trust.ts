import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONFIG_DIR_NAME, getUserHomeDir } from './agentDir'
import { canonicalizePath, resolvePath } from './paths'
import { acquireFileLock } from './settings/lock'
import { stripBom } from './text'

export type ProjectTrustDecision = boolean | null

export interface ProjectTrustStoreEntry {
  path: string
  decision: boolean
}

export interface ProjectTrustUpdate {
  path: string
  decision: ProjectTrustDecision
}

export interface ProjectTrustOption {
  label: string
  trusted: boolean
  updates: ProjectTrustUpdate[]
  savedPath?: string
}

type TrustFile = Record<string, boolean | null | undefined>

const NEWLINE = String.fromCharCode(10)

/**
 * Entries under the project config directory whose presence makes a project
 * require an explicit trust decision before its settings are loaded.
 */
const TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES = [
  'settings.json',
  'extensions',
  'skills',
  'prompts',
  'themes',
  'SYSTEM.md',
  'APPEND_SYSTEM.md',
] as const

function normalizeCwd(cwd: string): string {
  return canonicalizePath(resolvePath(cwd))
}

/** Walk up from cwd to the root, returning the first definite true/false entry. */
function findNearestTrustEntry(data: TrustFile, cwd: string): ProjectTrustStoreEntry | null {
  let currentDir = normalizeCwd(cwd)
  while (true) {
    const value = data[currentDir]
    if (value === true || value === false) {
      return { path: currentDir, decision: value }
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }
    currentDir = parentDir
  }
}

/** The parent of cwd, or undefined when cwd is the filesystem root. */
export function getProjectTrustParentPath(cwd: string): string | undefined {
  const trustPath = normalizeCwd(cwd)
  const parentDir = dirname(trustPath)
  return parentDir === trustPath ? undefined : parentDir
}

/**
 * The trust choices offered for a directory. Trusting the parent covers
 * sibling projects too; null decisions clear session-only entries.
 */
export function getProjectTrustOptions(cwd: string, options?: { includeSessionOnly?: boolean }): ProjectTrustOption[] {
  const trustPath = normalizeCwd(cwd)
  const trustOptions: ProjectTrustOption[] = [
    { label: 'Trust', trusted: true, updates: [{ path: trustPath, decision: true }], savedPath: trustPath },
  ]
  const parentPath = getProjectTrustParentPath(cwd)
  if (parentPath !== undefined) {
    trustOptions.push({
      label: 'Trust parent folder (' + parentPath + ')',
      trusted: true,
      updates: [
        { path: parentPath, decision: true },
        { path: trustPath, decision: null },
      ],
      savedPath: parentPath,
    })
  }
  if (options?.includeSessionOnly === true) {
    trustOptions.push({ label: 'Trust (this session only)', trusted: true, updates: [] })
  }
  trustOptions.push({
    label: 'Do not trust',
    trusted: false,
    updates: [{ path: trustPath, decision: false }],
    savedPath: trustPath,
  })
  if (options?.includeSessionOnly === true) {
    trustOptions.push({ label: 'Do not trust (this session only)', trusted: false, updates: [] })
  }
  return trustOptions
}

function readTrustFile(path: string): TrustFile {
  if (!existsSync(path)) {
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripBom(readFileSync(path, 'utf-8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error('Failed to read trust store ' + path + ': ' + message)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid trust store ' + path + ': expected an object')
  }

  const data: TrustFile = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== true && value !== false && value !== null) {
      throw new Error(
        'Invalid trust store ' + path + ': value for ' + JSON.stringify(key) + ' must be true, false, or null',
      )
    }
    data[key] = value
  }
  return data
}

function writeTrustFile(path: string, data: TrustFile): void {
  const sorted: TrustFile = {}
  for (const key of Object.keys(data).sort()) {
    const value = data[key]
    if (value === true || value === false || value === null) {
      sorted[key] = value
    }
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(sorted, null, 2) + NEWLINE, 'utf-8')
}

function withTrustFileLock<T>(path: string, fn: () => T): T {
  const lock = acquireFileLock(path)
  try {
    return fn()
  } finally {
    lock.release()
  }
}

/**
 * Returns true when cwd has project-local resources that must be gated by
 * project trust: trust-requiring entries under cwd/.black, or .agents/skills
 * in cwd or one of its ancestors. The user's global ~/.agents/skills directory
 * is always treated as a trusted user resource and is ignored here.
 */
export function hasTrustRequiringProjectResources(cwd: string): boolean {
  const homeDir = canonicalizePath(resolvePath(getUserHomeDir()))
  const userAgentsSkillsDir = join(homeDir, '.agents', 'skills')
  let currentDir = canonicalizePath(resolvePath(cwd))

  const configDir = join(currentDir, CONFIG_DIR_NAME)
  if (TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES.some((entry) => existsSync(join(configDir, entry)))) {
    return true
  }

  while (true) {
    const agentsSkillsDir = join(currentDir, '.agents', 'skills')
    if (agentsSkillsDir !== userAgentsSkillsDir && existsSync(agentsSkillsDir)) {
      return true
    }

    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      return false
    }
    currentDir = parentDir
  }
}

/**
 * Persistent project trust decisions stored in <agentDir>/trust.json, keyed by
 * canonicalized project path. A decision of true/false at any ancestor applies
 * to descendants until overridden; null removes an entry.
 */
export class ProjectTrustStore {
  private readonly trustPath: string

  constructor(agentDir: string) {
    this.trustPath = join(resolvePath(agentDir), 'trust.json')
  }

  get(cwd: string): ProjectTrustDecision {
    return this.getEntry(cwd)?.decision ?? null
  }

  getEntry(cwd: string): ProjectTrustStoreEntry | null {
    return withTrustFileLock(this.trustPath, () => {
      const data = readTrustFile(this.trustPath)
      return findNearestTrustEntry(data, cwd)
    })
  }

  set(cwd: string, decision: ProjectTrustDecision): void {
    this.setMany([{ path: cwd, decision }])
  }

  setMany(decisions: ProjectTrustUpdate[]): void {
    withTrustFileLock(this.trustPath, () => {
      const data = readTrustFile(this.trustPath)
      for (const { path, decision } of decisions) {
        const key = normalizeCwd(path)
        if (decision === null) {
          delete data[key]
        } else {
          data[key] = decision
        }
      }
      writeTrustFile(this.trustPath, data)
    })
  }
}
