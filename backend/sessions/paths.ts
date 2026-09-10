import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve as nodeResolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAgentDir } from '../config/agentDir'

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g
const TILDE_BACKSLASH_FORM = '~' + String.fromCharCode(92)

export interface PathInputOptions {
  /** Trim leading and trailing whitespace before normalization. Default: false. */
  trim?: boolean
  /** Expand a leading home marker to a home directory. Default: true. */
  expandTilde?: boolean
  /** Home directory used for tilde expansion. Default: os.homedir(). */
  homeDir?: string
  /** Normalize unicode space variants to regular spaces. Default: false. */
  normalizeUnicodeSpaces?: boolean
}

/** Convert Git Bash, MSYS, Cygwin, and WSL drive paths to a form native Windows APIs accept. */
function normalizeWindowsShellPath(filePath: string): string {
  if (!filePath.startsWith('/') || filePath.startsWith('//') || filePath.includes('\\')) {
    return filePath
  }
  const match = filePath.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i)
  if (match === null) return filePath
  const drive = match[1]
  if (drive === undefined) return filePath
  const suffix = (match[2] ?? '').replaceAll('/', String.fromCharCode(92))
  return drive.toUpperCase() + ':' + String.fromCharCode(92) + suffix
}

/**
 * Normalize user path input: whitespace, tilde expansion, file URLs, and
 * Windows shell path forms. Does not touch the filesystem.
 */
export function normalizePath(input: string, options: PathInputOptions = {}): string {
  let normalized = options.trim === true ? input.trim() : input
  if (options.normalizeUnicodeSpaces === true) {
    normalized = normalized.replace(UNICODE_SPACES, ' ')
  }
  if (process.platform === 'win32') {
    normalized = normalizeWindowsShellPath(normalized)
  }

  if (options.expandTilde ?? true) {
    const home = options.homeDir ?? homedir()
    if (normalized === '~') return home
    if (
      normalized.startsWith('~/') ||
      (process.platform === 'win32' && normalized.startsWith(TILDE_BACKSLASH_FORM))
    ) {
      return join(home, normalized.slice(2))
    }
  }

  if (/^file:\/\//.test(normalized)) {
    try {
      return fileURLToPath(normalized)
    } catch {
      // Malformed file URL: fall through and resolve it as a plain path.
    }
  }

  return normalized
}

/**
 * Resolve a path to an absolute form. Relative inputs resolve against
 * baseDir (default: current working directory). Resolution is purely
 * lexical; missing files are not an error here.
 */
export function resolvePath(input: string, baseDir: string = process.cwd()): string {
  const normalized = normalizePath(input)
  const normalizedBaseDir = normalizePath(baseDir)
  if (isAbsolute(normalized)) return nodeResolvePath(normalized)
  return nodeResolvePath(normalizedBaseDir, normalized)
}

/**
 * Encode a working directory into a session folder name:
 * /home/me/proj becomes --home-me-proj--. Separator characters and colons
 * collapse to '-', so the name is safe on every platform.
 */
export function encodeCwdToDirName(cwd: string): string {
  return '--' + cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-') + '--'
}

/** Sessions live under the agent dir: agentDir/sessions. */
export function getDefaultSessionsParentDir(agentDir: string = getAgentDir()): string {
  return join(agentDir, 'sessions')
}

/** Default session directory for a cwd, without creating it. */
export function getDefaultSessionDirPath(cwd: string, agentDir: string = getAgentDir()): string {
  const resolvedCwd = resolvePath(cwd)
  const resolvedAgentDir = resolvePath(agentDir)
  return join(resolvedAgentDir, 'sessions', encodeCwdToDirName(resolvedCwd))
}

/** Default per-project session directory for a cwd, creating it if missing. */
export function getDefaultSessionDir(cwd: string, agentDir: string = getAgentDir()): string {
  const dir = getDefaultSessionDirPath(cwd, agentDir)
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error('Failed to create session directory ' + dir + ': ' + message)
    }
  }
  return dir
}

/**
 * Session file name for a new session: the timestamp with Windows-hostile
 * characters replaced, then the session id. Example:
 * 2026-01-01T00-00-00-000Z_01234567-89ab-7cde-8f01-23456789abcd.jsonl
 */
export function sessionFileName(timestamp: string, sessionId: string): string {
  return timestamp.replace(/[:.]/g, '-') + '_' + sessionId + '.jsonl'
}
