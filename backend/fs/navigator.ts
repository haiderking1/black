import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export interface DirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
  isHidden: boolean
}

export interface DirectoryResult {
  currentPath: string
  parentPath: string | null
  entries: DirectoryEntry[]
  error?: string
}

function resolveUserPath(inputPath?: unknown): string {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    return process.cwd()
  }

  const trimmed = inputPath.trim()
  if (trimmed === '~' || trimmed.startsWith('~/')) {
    return path.join(os.homedir(), trimmed.slice(1))
  }

  return path.resolve(trimmed)
}

export async function listDirectory(targetPath?: unknown): Promise<DirectoryResult> {
  const resolved = resolveUserPath(targetPath)

  try {
    const stats = await fs.stat(resolved)
    if (!stats.isDirectory()) {
      return {
        currentPath: resolved,
        parentPath: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
        entries: [],
        error: 'Target is not a directory'
      }
    }

    const dirents = await fs.readdir(resolved, { withFileTypes: true })
    const entries: DirectoryEntry[] = []

    for (const d of dirents) {
      // Determine if directory or symlink to directory
      let isDir = d.isDirectory()
      if (d.isSymbolicLink()) {
        try {
          const targetStat = await fs.stat(path.join(resolved, d.name))
          isDir = targetStat.isDirectory()
        } catch {
          // Dead symlink or unreadable
          isDir = false
        }
      }

      entries.push({
        name: d.name,
        path: path.join(resolved, d.name),
        isDirectory: isDir,
        isHidden: d.name.startsWith('.')
      })
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    })

    const parent = path.dirname(resolved)
    const parentPath = parent !== resolved ? parent : null

    return {
      currentPath: resolved,
      parentPath,
      entries
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const parent = path.dirname(resolved)
    return {
      currentPath: resolved,
      parentPath: parent !== resolved ? parent : null,
      entries: [],
      error: message
    }
  }
}
