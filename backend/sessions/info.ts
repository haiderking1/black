import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { StringDecoder } from 'node:string_decoder'
import type { SessionHeader, SessionInfo, SessionListProgress } from './types'
import {
  MAX_SESSION_HEADER_SCAN_BYTES,
  parseSessionEntryLine,
  readSessionHeaderForDiscovery,
} from './parse'
import { normalizePath, resolvePath } from './paths'

function isMessageWithContent(message: unknown): message is { role: unknown; content: unknown } {
  return typeof message === 'object' && message !== null && 'content' in message && 'role' in message
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const texts: string[] = []
  for (const block of content) {
    if (
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      texts.push((block as { text: string }).text)
    }
  }
  return texts.join(' ')
}

function getMessageActivityTime(entry: { timestamp: unknown; message: unknown }): number | undefined {
  if (!isMessageWithContent(entry.message)) return undefined
  const role = (entry.message as { role?: unknown }).role
  if (role !== 'user' && role !== 'assistant') return undefined

  const messageTimestamp = (entry.message as { timestamp?: unknown }).timestamp
  if (typeof messageTimestamp === 'number' && Number.isFinite(messageTimestamp)) {
    return messageTimestamp
  }

  if (typeof entry.timestamp === 'string') {
    const parsed = new Date(entry.timestamp).getTime()
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

/**
 * Build display metadata for one session file. Returns null when the file is
 * unreadable, empty, or does not start with a session header.
 */
export async function buildSessionInfo(filePath: string): Promise<SessionInfo | null> {
  try {
    const stats = await stat(filePath)
    let header: SessionHeader | null = null
    let messageCount = 0
    let firstMessage = ''
    const allMessages: string[] = []
    let name: string | undefined
    let lastActivityTime: number | undefined

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      const entry = parseSessionEntryLine(line)
      if (entry === null) continue

      if (header === null) {
        if (entry.type !== 'session') return null
        header = entry as SessionHeader
        continue
      }

      // Extract the session name; the latest entry wins, including explicit clears.
      if (entry.type === 'session_info') {
        const entryName = (entry as { name?: unknown }).name
        name = typeof entryName === 'string' && entryName.trim() !== '' ? entryName.trim() : undefined
      }

      if (entry.type !== 'message') continue
      messageCount++

      const activityTime = getMessageActivityTime(entry as { timestamp: unknown; message: unknown })
      if (activityTime !== undefined) {
        lastActivityTime = Math.max(lastActivityTime ?? 0, activityTime)
      }

      const message = (entry as { message?: unknown }).message
      if (!isMessageWithContent(message)) continue
      const role = (message as { role?: unknown }).role
      if (role !== 'user' && role !== 'assistant') continue

      const textContent = extractTextContent((message as { content?: unknown }).content)
      if (textContent === '') continue

      allMessages.push(textContent)
      if (firstMessage === '' && role === 'user') {
        firstMessage = textContent
      }
    }

    rl.close()
    if (header === null) return null

    const headerCwd = (header as { cwd?: unknown }).cwd
    const cwd = typeof headerCwd === 'string' ? headerCwd : ''
    const parentSessionPath = (header as { parentSession?: unknown }).parentSession
    const headerTime = typeof header.timestamp === 'string' ? new Date(header.timestamp).getTime() : NaN
    const modified =
      typeof lastActivityTime === 'number' && lastActivityTime > 0
        ? new Date(lastActivityTime)
        : !Number.isNaN(headerTime)
          ? new Date(headerTime)
          : stats.mtime

    const info: SessionInfo = {
      path: filePath,
      id: header.id,
      cwd,
      modified,
      created: new Date(headerTime),
      messageCount,
      firstMessage: firstMessage !== '' ? firstMessage : '(no messages)',
      allMessagesText: allMessages.join(' '),
    }
    if (name !== undefined) info.name = name
    if (typeof parentSessionPath === 'string' && parentSessionPath !== '') {
      info.parentSessionPath = parentSessionPath
    }
    return info
  } catch {
    return null
  }
}

const MAX_CONCURRENT_SESSION_INFO_LOADS = 10

async function buildSessionInfosWithConcurrency(
  files: string[],
  onLoaded: () => void,
): Promise<Array<SessionInfo | null>> {
  const results: Array<SessionInfo | null> = new Array(files.length).fill(null)
  const inFlight = new Set<Promise<void>>()
  let nextIndex = 0

  const startNext = (): void => {
    const index = nextIndex++
    const file = files[index]
    if (file === undefined) return

    const task: Promise<void> = buildSessionInfo(file)
      .then((info) => {
        results[index] = info
      })
      .catch(() => {
        results[index] = null
      })
      .finally(() => {
        inFlight.delete(task)
        onLoaded()
      })
    inFlight.add(task)
  }

  while (nextIndex < files.length || inFlight.size > 0) {
    while (nextIndex < files.length && inFlight.size < MAX_CONCURRENT_SESSION_INFO_LOADS) {
      startNext()
    }
    if (inFlight.size > 0) {
      await Promise.race(inFlight)
    }
  }

  return results
}

/** List sessions in one directory, newest modified first. */
export async function listSessionsFromDir(
  dir: string,
  onProgress?: SessionListProgress,
): Promise<SessionInfo[]> {
  const sessions: SessionInfo[] = []
  if (!existsSync(dir)) {
    return sessions
  }

  try {
    const dirEntries = await readdir(dir)
    const files = dirEntries.filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f))
    let loaded = 0
    const results = await buildSessionInfosWithConcurrency(files, () => {
      loaded++
      onProgress?.(loaded, files.length)
    })
    for (const info of results) {
      if (info !== null) sessions.push(info)
    }
  } catch {
    // Directory access races and unreadable folders yield an empty list.
  }

  return sessions
}

function getSessionHeaderCwd(header: SessionHeader): string | undefined {
  const cwd = (header as { cwd?: unknown }).cwd
  return typeof cwd === 'string' ? cwd : undefined
}

export function sessionCwdMatches(cwd: string | undefined, resolvedCwd: string): boolean {
  return cwd !== undefined && cwd !== '' && resolvePath(cwd) === resolvedCwd
}

/**
 * Find the most recently modified session in a directory, optionally filtered
 * to a working directory. Synchronous because resume flows need the answer
 * before anything else runs. Returns null on any directory access failure.
 */
export function findMostRecentSession(sessionDir: string, cwd?: string): string | null {
  const resolvedSessionDir = normalizePath(sessionDir)
  const resolvedCwd = cwd !== undefined ? resolvePath(cwd) : undefined
  try {
    const files = readdirSync(resolvedSessionDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(resolvedSessionDir, f))
      .map((path) => ({ path, header: readSessionHeaderForDiscovery(path) }))
      .filter(
        (file): file is { path: string; header: SessionHeader } =>
          file.header !== null &&
          (resolvedCwd === undefined || sessionCwdMatches(getSessionHeaderCwd(file.header), resolvedCwd)),
      )
      .map(({ path }) => ({ path, mtime: statSync(path).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    return files[0]?.path ?? null
  } catch {
    // Directory access and stat races make recent-session discovery unavailable.
    return null
  }
}

/**
 * Read every session file under a parent directory (one folder per project).
 * Files that fail to load are skipped; folder iteration never throws.
 */
export async function listAllSessionsFromParent(
  parentDir: string,
  onProgress?: SessionListProgress,
): Promise<SessionInfo[]> {
  try {
    if (!existsSync(parentDir)) return []

    const entries = await readdir(parentDir, { withFileTypes: true })
    const dirs = entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => join(parentDir, entry.name))

    let totalFiles = 0
    const dirFiles: string[][] = []
    for (const dir of dirs) {
      try {
        const files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'))
        dirFiles.push(files.map((f) => join(dir, f)))
        totalFiles += files.length
      } catch {
        dirFiles.push([])
      }
    }

    const allFiles = dirFiles.flat()
    let loaded = 0
    const results = await buildSessionInfosWithConcurrency(allFiles, () => {
      loaded++
      onProgress?.(loaded, totalFiles)
    })

    const sessions: SessionInfo[] = []
    for (const info of results) {
      if (info !== null) sessions.push(info)
    }
    return sessions
  } catch {
    return []
  }
}

export function sortSessionsByModified(sessions: SessionInfo[]): SessionInfo[] {
  return [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime())
}

export { MAX_SESSION_HEADER_SCAN_BYTES }
