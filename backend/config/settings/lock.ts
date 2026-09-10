import { mkdirSync, rmSync, statSync } from 'node:fs'

export interface FileLockOptions {
  /** Total attempts before giving up. Default 10. */
  maxAttempts?: number
  /** Sleep between attempts in milliseconds. Default 20. */
  retryDelayMs?: number
  /** Age in milliseconds after which a leftover lock is treated as abandoned. Default 30000. */
  staleMs?: number
}

export interface FileLock {
  release(): void
}

const DEFAULT_MAX_ATTEMPTS = 10
const DEFAULT_RETRY_DELAY_MS = 20
const DEFAULT_STALE_MS = 30_000

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4))

/** Sleep synchronously; busy-waits only when Atomics.wait is unavailable. */
function sleepSync(ms: number): void {
  try {
    Atomics.wait(sleepBuffer, 0, 0, ms)
  } catch {
    const start = Date.now()
    while (Date.now() - start < ms) {
      // Spin until the delay elapses.
    }
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

function removeLockDir(lockPath: string): void {
  rmSync(lockPath, { recursive: true, force: true })
}

/**
 * Acquire a cooperative lock on targetPath by creating a "<target>.lock"
 * directory. Waits out competing holders and takes over locks that have been
 * abandoned longer than staleMs. The caller MUST call release().
 */
export function acquireFileLock(targetPath: string, options: FileLockOptions = {}): FileLock {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS
  const lockPath = targetPath + '.lock'
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      mkdirSync(lockPath)
      return {
        release(): void {
          removeLockDir(lockPath)
        },
      }
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') {
        throw error
      }
      lastError = error

      // Take over locks left behind by a crashed process.
      try {
        const stats = statSync(lockPath)
        if (Date.now() - stats.mtimeMs > staleMs) {
          removeLockDir(lockPath)
          continue
        }
      } catch {
        // The holder released between mkdir and stat; retry immediately.
        continue
      }

      if (attempt < maxAttempts) {
        sleepSync(retryDelayMs)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to acquire lock for ' + targetPath)
}
