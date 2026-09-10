import { existsSync } from 'node:fs'
import type { SessionManager } from './manager'

export interface SessionCwdIssue {
  sessionFile?: string
  sessionCwd: string
  fallbackCwd: string
}

interface SessionCwdSource {
  getCwd(): string
  getSessionFile(): string | undefined
}

/**
 * Detect a persisted session whose stored working directory no longer exists
 * (renamed or deleted project). In-memory sessions never trip this: they have
 * no file on disk to resume.
 */
export function getMissingSessionCwdIssue(
  sessionManager: SessionCwdSource,
  fallbackCwd: string,
): SessionCwdIssue | undefined {
  const sessionFile = sessionManager.getSessionFile()
  if (sessionFile === undefined || sessionFile === '') {
    return undefined
  }

  const sessionCwd = sessionManager.getCwd()
  if (sessionCwd === '' || existsSync(sessionCwd)) {
    return undefined
  }

  return { sessionFile, sessionCwd, fallbackCwd }
}

export function formatMissingSessionCwdError(issue: SessionCwdIssue): string {
  const sessionFileLine = issue.sessionFile !== undefined ? '\nSession file: ' + issue.sessionFile : ''
  return (
    'Stored session working directory does not exist: ' +
    issue.sessionCwd +
    sessionFileLine +
    '\nCurrent working directory: ' +
    issue.fallbackCwd
  )
}

export class MissingSessionCwdError extends Error {
  readonly issue: SessionCwdIssue

  constructor(issue: SessionCwdIssue) {
    super(formatMissingSessionCwdError(issue))
    this.name = 'MissingSessionCwdError'
    this.issue = issue
  }
}

/** Throw a controlled error when a resumable session's cwd vanished. */
export function assertSessionCwdExists(
  sessionManager: SessionCwdSource,
  fallbackCwd: string,
): void {
  const issue = getMissingSessionCwdIssue(sessionManager, fallbackCwd)
  if (issue !== undefined) {
    throw new MissingSessionCwdError(issue)
  }
}
