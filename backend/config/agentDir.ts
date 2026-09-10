import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_NAME = 'black'
export const CONFIG_DIR_NAME = '.black'

/** Environment override for the whole agent config directory. */
export const ENV_AGENT_DIR = 'BLACK_AGENT_DIR'
/** Environment override for just the sessions directory. */
export const ENV_SESSION_DIR = 'BLACK_SESSIONS_DIR'

/**
 * The user's home directory. Reads HOME first so tests and sandboxed
 * environments can redirect it, falling back to the OS lookup.
 */
export function getUserHomeDir(): string {
  const home = process.env['HOME']
  return typeof home === 'string' && home.trim() !== '' ? home : homedir()
}

/**
 * Expand a leading home marker to the given (or current user's) home directory.
 * Handles the bare marker, the forward-slash form and (on Windows) the
 * backslash form; anything else is returned untouched.
 */
export function expandTildePath(input: string, homeDir?: string): string {
  const home = homeDir ?? getUserHomeDir()
  if (input === '~') return home
  if (input.startsWith('~/') || (process.platform === 'win32' && input.startsWith('~' + String.fromCharCode(92)))) {
    return join(home, input.slice(2))
  }
  return input
}

/** Resolve the agent config directory, for example /home/user/.black/agent. */
export function getAgentDir(): string {
  const envDir = process.env[ENV_AGENT_DIR]
  if (typeof envDir === 'string' && envDir.trim() !== '') {
    return expandTildePath(envDir.trim())
  }
  return join(getUserHomeDir(), CONFIG_DIR_NAME, 'agent')
}

/** Resolve the directory that stores per-project session folders. */
export function getSessionsDir(): string {
  const envDir = process.env[ENV_SESSION_DIR]
  if (typeof envDir === 'string' && envDir.trim() !== '') {
    return expandTildePath(envDir.trim())
  }
  return join(getAgentDir(), 'sessions')
}
