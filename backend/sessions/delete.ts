import { execFile } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'

const execFileAsync = promisify(execFile)

let trashAvailable: boolean | undefined

function detectTrash(): boolean {
  if (trashAvailable !== undefined) return trashAvailable
  try {
    const pathEnv = process.env.PATH ?? ''
    const candidates = pathEnv.split(':').filter((part) => part !== '')
    for (const dir of candidates) {
      if (existsSync(dir + '/trash')) {
        trashAvailable = true
        return true
      }
    }
    trashAvailable = false
  } catch {
    trashAvailable = false
  }
  return trashAvailable
}

export interface DeleteSessionResult {
  deleted: boolean
  trashUsed: boolean
  error?: string
}

async function moveToTrash(filePath: string): Promise<boolean> {
  try {
    await execFileAsync('trash', [filePath])
    return true
  } catch {
    return false
  }
}

/**
 * Delete a session file. Prefers the trash CLI so users can recover the
 * session; falls back to unlink when trash is unavailable or fails. Missing
 * files count as already deleted.
 */
export async function deleteSessionFile(
  filePath: string,
  options?: { trashEnabled?: boolean },
): Promise<DeleteSessionResult> {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return { deleted: false, trashUsed: false, error: 'Invalid session path' }
  }

  if (!existsSync(filePath)) {
    return { deleted: true, trashUsed: false }
  }

  const shouldTryTrash = options?.trashEnabled ?? detectTrash()
  if (shouldTryTrash) {
    const trashed = await moveToTrash(filePath)
    if (trashed) return { deleted: true, trashUsed: true }
  }

  try {
    await unlink(filePath)
    return { deleted: true, trashUsed: false }
  } catch (err: unknown) {
    const code = (err as { code?: unknown }).code
    if (code === 'ENOENT') return { deleted: true, trashUsed: false }
    const message = err instanceof Error ? err.message : String(err)
    return { deleted: false, trashUsed: false, error: message }
  }
}

/** Test hook: reset the cached trash detection. */
export function resetTrashDetection(): void {
  trashAvailable = undefined
}
