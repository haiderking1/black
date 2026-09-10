import { appendFileSync, closeSync, existsSync, openSync, readSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import type { FileEntry, SessionHeader } from './types'
import { normalizePath, resolvePath } from './paths'

export const SESSION_READ_BUFFER_SIZE = 1024 * 1024
export const SESSION_HEADER_READ_BUFFER_SIZE = 4096
/** Bound synchronous header discovery while allowing large cwd and custom metadata fields. */
export const MAX_SESSION_HEADER_SCAN_BYTES = 1024 * 1024

export class SessionHeaderScanLimitError extends Error {
  readonly filePath: string

  constructor(filePath: string) {
    super('Session header exceeds ' + MAX_SESSION_HEADER_SCAN_BYTES + '-byte scan limit: ' + filePath)
    this.name = 'SessionHeaderScanLimitError'
    this.filePath = filePath
  }
}

export function parseSessionEntryLine(line: string): FileEntry | null {
  if (!line.trim()) return null
  try {
    return JSON.parse(line) as FileEntry
  } catch {
    // Skip malformed lines.
    return null
  }
}

/** Parse a whole session file from a string. Malformed and blank lines are skipped. */
export function parseSessionEntries(content: string): FileEntry[] {
  const entries: FileEntry[] = []
  const lines = content.trim().split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line) as FileEntry)
    } catch {
      // Skip malformed lines.
    }
  }

  return entries
}

/**
 * Load every parseable entry from a session file.
 *
 * Reads in bounded chunks with a stateful UTF-8 decoder, so multi-byte
 * characters split across chunk boundaries survive. Returns an empty array for
 * missing files and for files whose first parseable entry is not a valid
 * session header; those files are left untouched on disk.
 *
 * A trailing line without a newline terminator still parses. When the file has
 * one, a newline is appended so future appends start on a fresh line.
 */
export function loadEntriesFromFile(filePath: string): FileEntry[] {
  const resolvedFilePath = normalizePath(filePath)
  if (!existsSync(resolvedFilePath)) return []

  const entries: FileEntry[] = []
  let pending = ''
  const fd = openSync(resolvedFilePath, 'r')
  try {
    const decoder = new StringDecoder('utf8')
    const buffer = Buffer.allocUnsafe(SESSION_READ_BUFFER_SIZE)

    while (true) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead === 0) break

      pending += decoder.write(buffer.subarray(0, bytesRead))
      let lineStart = 0
      let newlineIndex = pending.indexOf('\n', lineStart)
      while (newlineIndex !== -1) {
        const entry = parseSessionEntryLine(pending.slice(lineStart, newlineIndex))
        if (entry !== null) entries.push(entry)
        lineStart = newlineIndex + 1
        newlineIndex = pending.indexOf('\n', lineStart)
      }
      pending = pending.slice(lineStart)
    }

    pending += decoder.end()
    const finalEntry = parseSessionEntryLine(pending)
    if (finalEntry !== null) entries.push(finalEntry)
  } finally {
    closeSync(fd)
  }

  // Validate the session header before repairing the file.
  if (entries.length === 0) return entries
  const header = entries[0]
  if (header === undefined) return []
  if (header.type !== 'session' || typeof (header as { id?: unknown }).id !== 'string') {
    return []
  }

  if (pending !== '') appendFileSync(resolvedFilePath, '\n')
  return entries
}

/**
 * Inspect one physical line while searching for the first parseable session
 * entry. Blank and malformed lines are skipped, matching loadEntriesFromFile().
 * Returns undefined to keep scanning, null for a parsed non-header entry, or
 * the header itself.
 */
function parseSessionHeaderCandidate(line: string): SessionHeader | null | undefined {
  if (!line.trim()) return undefined
  const entry = parseSessionEntryLine(line)
  if (entry === null) return undefined
  if (entry.type !== 'session' || typeof (entry as { id?: unknown }).id !== 'string') return null
  return entry
}

/**
 * Read just the session header without loading the whole file.
 * Scans at most MAX_SESSION_HEADER_SCAN_BYTES; anything beyond that raises
 * SessionHeaderScanLimitError so a pathological first line cannot pin the
 * main process.
 */
export function readSessionHeader(filePath: string): SessionHeader | null {
  const resolved = resolvePath(filePath)
  const fd = openSync(resolved, 'r')
  try {
    const decoder = new StringDecoder('utf8')
    const buffer = Buffer.allocUnsafe(SESSION_HEADER_READ_BUFFER_SIZE)
    const lineChunks: string[] = []
    let scannedBytes = 0

    while (scannedBytes < MAX_SESSION_HEADER_SCAN_BYTES) {
      const readLength = Math.min(buffer.length, MAX_SESSION_HEADER_SCAN_BYTES - scannedBytes)
      const bytesRead = readSync(fd, buffer, 0, readLength, null)
      if (bytesRead === 0) {
        lineChunks.push(decoder.end())
        return parseSessionHeaderCandidate(lineChunks.join('')) ?? null
      }
      scannedBytes += bytesRead

      const chunk = decoder.write(buffer.subarray(0, bytesRead))
      let lineStart = 0
      let newlineIndex = chunk.indexOf('\n', lineStart)
      while (newlineIndex !== -1) {
        lineChunks.push(chunk.slice(lineStart, newlineIndex))
        const header = parseSessionHeaderCandidate(lineChunks.join(''))
        if (header !== undefined) return header
        lineChunks.length = 0
        lineStart = newlineIndex + 1
        newlineIndex = chunk.indexOf('\n', lineStart)
      }
      lineChunks.push(chunk.slice(lineStart))
    }

    // Probe for EOF so a final header without a newline is allowed when it ends
    // exactly at the scan limit. Any additional byte exceeds the bounded scan.
    const probe = Buffer.allocUnsafe(1)
    if (readSync(fd, probe, 0, probe.length, null) === 0) {
      lineChunks.push(decoder.end())
      return parseSessionHeaderCandidate(lineChunks.join('')) ?? null
    }
    throw new SessionHeaderScanLimitError(resolved)
  } finally {
    closeSync(fd)
  }
}

/**
 * Header read for session discovery: best effort. Unreadable or oversized
 * files are treated as non-sessions so one corrupt file cannot hide the rest.
 */
export function readSessionHeaderForDiscovery(filePath: string): SessionHeader | null {
  try {
    return readSessionHeader(filePath)
  } catch {
    return null
  }
}

export function isSessionHeader(value: unknown): value is SessionHeader {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { type?: unknown; id?: unknown }
  return candidate.type === 'session' && typeof candidate.id === 'string' && candidate.id !== ''
}
