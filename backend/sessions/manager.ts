import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { getSessionsDir } from '../config/agentDir'
import { generateEntryId, assertValidSessionId, uuidv7 } from './ids'
import {
  findMostRecentSession,
  listAllSessionsFromParent,
  listSessionsFromDir,
  sortSessionsByModified,
} from './info'
import { loadEntriesFromFile, readSessionHeader, SessionHeaderScanLimitError } from './parse'
import { getDefaultSessionDir, getDefaultSessionDirPath, normalizePath, resolvePath, sessionFileName } from './paths'
import { migrateToCurrentVersion } from './migrations'
import { buildContextEntries, buildSessionContext, type SessionContext } from './context'
import { CURRENT_SESSION_VERSION } from './types'
import type {
  AgentMessage,
  BashExecutionMessage,
  BranchSummaryEntry,
  CompactionEntry,
  CustomEntry,
  CustomMessage,
  CustomMessageEntry,
  FileEntry,
  ImageContent,
  LabelEntry,
  Message,
  ModelChangeEntry,
  NewSessionOptions,
  SessionEntry,
  SessionHeader,
  SessionInfo,
  SessionInfoEntry,
  SessionListProgress,
  SessionMessageEntry,
  SessionEntryBase,
  TextContent,
  ThinkingLevelChangeEntry,
  Usage,
} from './types'

export type { SessionContext }

/** Messages the UI may append directly. Compaction and branch summaries have dedicated methods. */
export type AppendableMessage = Message | CustomMessage | BashExecutionMessage

function createSessionId(): string {
  return uuidv7()
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Manages conversation sessions as append-only JSONL files.
 *
 * Every append creates a child of the current leaf; in this implementation the
 * chain is linear, so the leaf is always the newest entry. Persistence defers
 * until the first assistant message so aborted sessions never leave a file
 * with only a header.
 */
export class SessionManager {
  private sessionId: string = ''
  private sessionFile: string | undefined
  private sessionDir: string
  private cwd: string
  private persist: boolean
  private flushed: boolean = false
  private fileEntries: FileEntry[] = []
  private byId: Map<string, SessionEntry> = new Map()
  private labelsById: Map<string, string> = new Map()
  private labelTimestampsById: Map<string, string> = new Map()
  private leafId: string | null = null

  private constructor(
    cwd: string,
    sessionDir: string,
    sessionFile: string | undefined,
    persist: boolean,
    newSessionOptions?: NewSessionOptions,
    preloadedFileEntries?: FileEntry[],
  ) {
    this.cwd = resolvePath(cwd)
    this.sessionDir = normalizePath(sessionDir)
    this.persist = persist
    if (persist && this.sessionDir !== '' && !existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true })
    }

    if (sessionFile !== undefined) {
      this.initSessionFile(sessionFile, preloadedFileEntries)
    } else if (preloadedFileEntries !== undefined && preloadedFileEntries.length > 0) {
      this.loadEntries(preloadedFileEntries, newSessionOptions)
    } else {
      this.newSession(newSessionOptions)
    }
  }

  /** Switch to a different session file (used for resume). */
  setSessionFile(sessionFile: string): void {
    this.initSessionFile(sessionFile)
  }

  private initSessionFile(sessionFile: string, preloadedFileEntries?: FileEntry[]): void {
    this.sessionFile = resolvePath(sessionFile)
    if (existsSync(this.sessionFile)) {
      const entries = preloadedFileEntries ?? loadEntriesFromFile(this.sessionFile)

      // An empty file is initialized with a valid header. A non-empty file that
      // does not parse as a black session fails without modifying the file.
      if (entries.length === 0) {
        const explicitPath = this.sessionFile
        if (statSync(explicitPath).size > 0) {
          throw new Error('Session file is not a valid black session: ' + explicitPath)
        }
        this.newSession()
        this.sessionFile = explicitPath
        this.rewriteFile()
        this.flushed = true
        return
      }

      this.loadEntries(entries)
      this.flushed = true
    } else {
      const explicitPath = this.sessionFile
      this.newSession()
      // Preserve the explicit path from the open call.
      this.sessionFile = explicitPath
    }
  }

  /** Start a new session, replacing in-memory state. Returns the file path when persisting. */
  newSession(options?: NewSessionOptions): string | undefined {
    if (options?.id !== undefined) {
      assertValidSessionId(options.id)
    }
    this.sessionId = options?.id ?? createSessionId()
    const timestamp = nowIso()
    const header: SessionHeader = {
      type: 'session',
      version: CURRENT_SESSION_VERSION,
      id: this.sessionId,
      timestamp,
      cwd: this.cwd,
    }
    if (options?.parentSession !== undefined) {
      header.parentSession = options.parentSession
    }
    this.fileEntries = [header]
    this.byId.clear()
    this.labelsById.clear()
    this.labelTimestampsById.clear()
    this.leafId = null
    this.flushed = false

    if (this.persist) {
      this.sessionFile = join(this.getSessionDir(), sessionFileName(timestamp, this.sessionId))
    }
    return this.sessionFile
  }

  private loadEntries(entries: FileEntry[], options?: NewSessionOptions): void {
    const header = entries.find((entry): entry is SessionHeader => entry.type === 'session')

    if (header !== undefined) {
      this.fileEntries = entries
      this.sessionId = header.id

      if (migrateToCurrentVersion(this.fileEntries)) {
        this.rewriteFile()
      }
    } else {
      // Headerless entries (restored from elsewhere): synthesize a header.
      this.newSession(options)
      this.fileEntries = this.fileEntries.concat(entries)
    }

    this.buildIndex()
  }

  private buildIndex(): void {
    this.byId.clear()
    this.labelsById.clear()
    this.labelTimestampsById.clear()
    this.leafId = null
    for (const entry of this.fileEntries) {
      if (entry.type === 'session') continue
      this.byId.set(entry.id, entry)
      this.leafId = entry.id
      if (entry.type === 'label') {
        if (entry.label !== undefined && entry.label !== '') {
          this.labelsById.set(entry.targetId, entry.label)
          this.labelTimestampsById.set(entry.targetId, entry.timestamp)
        } else {
          this.labelsById.delete(entry.targetId)
          this.labelTimestampsById.delete(entry.targetId)
        }
      }
    }
  }

  /** Rewrite the whole file from in-memory entries. Used by migrations. */
  private rewriteFile(): void {
    if (!this.persist || this.sessionFile === undefined) return
    const fd = openSync(this.sessionFile, 'w')
    try {
      for (const entry of this.fileEntries) {
        writeFileSync(fd, JSON.stringify(entry) + '\n')
      }
    } finally {
      closeSync(fd)
    }
  }

  isPersisted(): boolean {
    return this.persist
  }

  getCwd(): string {
    return this.cwd
  }

  getSessionDir(): string {
    return this.sessionDir
  }

  usesDefaultSessionDir(): boolean {
    return this.sessionDir === getDefaultSessionDirPath(this.cwd)
  }

  getSessionId(): string {
    return this.sessionId
  }

  getSessionFile(): string | undefined {
    return this.sessionFile
  }

  private persistEntry(entry: SessionEntry): void {
    if (!this.persist || this.sessionFile === undefined) return

    const hasAssistant = this.fileEntries.some(
      (candidate) => candidate.type === 'message' && candidate.message.role === 'assistant',
    )
    if (!hasAssistant) {
      // Defer file creation until an assistant message exists. A dropped
      // session (user closed the window mid-turn) then leaves no file behind.
      if (this.flushed) {
        this.appendLine(entry)
      }
      return
    }

    if (!this.flushed) {
      const fd = openSync(this.sessionFile, 'wx')
      try {
        for (const existing of this.fileEntries) {
          writeFileSync(fd, JSON.stringify(existing) + '\n')
        }
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'EEXIST') {
          throw new Error(
            'Session file already exists (session id collision): ' + this.sessionFile,
          )
        }
        throw err
      } finally {
        closeSync(fd)
      }
      this.flushed = true
    } else {
      this.appendLine(entry)
    }
  }

  private appendLine(entry: SessionEntry): void {
    if (this.sessionFile === undefined) return
    try {
      appendFileSync(this.sessionFile, JSON.stringify(entry) + '\n')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error('Failed to append to session file ' + this.sessionFile + ': ' + message, {
        cause: err instanceof Error ? err : undefined,
      })
    }
  }

  private appendEntry(entry: SessionEntry): string {
    this.fileEntries.push(entry)
    this.byId.set(entry.id, entry)
    this.leafId = entry.id
    this.persistEntry(entry)
    return entry.id
  }

  private baseEntry(type: SessionEntry['type']): SessionEntryBase {
    return {
      type,
      id: generateEntryId(this.byId),
      parentId: this.leafId,
      timestamp: nowIso(),
    }
  }

  /**
   * Append a message as a child of the current leaf, then advance the leaf.
   * Compaction and branch summaries are appended through their dedicated
   * methods so they stay top-level entries in the session.
   */
  appendMessage(message: AppendableMessage): string {
    const entry: SessionMessageEntry = {
      ...this.baseEntry('message'),
      type: 'message',
      message,
    }
    return this.appendEntry(entry)
  }

  /** Append a thinking level change, then advance the leaf. Returns the entry id. */
  appendThinkingLevelChange(thinkingLevel: string): string {
    const entry: ThinkingLevelChangeEntry = {
      ...this.baseEntry('thinking_level_change'),
      type: 'thinking_level_change',
      thinkingLevel,
    }
    return this.appendEntry(entry)
  }

  /** Append a model change, then advance the leaf. Returns the entry id. */
  appendModelChange(provider: string, modelId: string): string {
    const entry: ModelChangeEntry = {
      ...this.baseEntry('model_change'),
      type: 'model_change',
      provider,
      modelId,
    }
    return this.appendEntry(entry)
  }

  /** Append a compaction checkpoint, then advance the leaf. Returns the entry id. */
  appendCompaction<TDetails = unknown>(
    summary: string,
    firstKeptEntryId: string,
    tokensBefore: number,
    details?: TDetails,
    fromHook?: boolean,
    usage?: Usage,
    retainedTail?: AgentMessage[],
  ): string {
    const entry: CompactionEntry<TDetails> = {
      ...this.baseEntry('compaction'),
      type: 'compaction',
      summary,
      firstKeptEntryId,
      tokensBefore,
      details,
      usage,
      fromHook,
    }
    if (retainedTail !== undefined) {
      entry.retainedTail = retainedTail
    }
    return this.appendEntry(entry)
  }

  /** Append a branch summary for an abandoned branch, then advance the leaf. Returns the entry id. */
  appendBranchSummary<TDetails = unknown>(
    summary: string,
    fromId: string,
    details?: TDetails,
    fromHook?: boolean,
    usage?: Usage,
  ): string {
    const entry: BranchSummaryEntry<TDetails> = {
      ...this.baseEntry('branch_summary'),
      type: 'branch_summary',
      summary,
      fromId,
      details,
      usage,
      fromHook,
    }
    return this.appendEntry(entry)
  }

  /** Append an extension state entry (not sent to the LLM). Returns the entry id. */
  appendCustomEntry<TData = unknown>(customType: string, data?: TData): string {
    const entry: CustomEntry<TData> = {
      ...this.baseEntry('custom'),
      type: 'custom',
      customType,
      data,
    }
    return this.appendEntry(entry)
  }

  /**
   * Append an extension message entry that participates in LLM context.
   * display controls UI visibility; details stay out of the LLM payload.
   */
  appendCustomMessageEntry<TDetails = unknown>(
    customType: string,
    content: string | (TextContent | ImageContent)[],
    display: boolean,
    details?: TDetails,
  ): string {
    const entry: CustomMessageEntry<TDetails> = {
      ...this.baseEntry('custom_message'),
      type: 'custom_message',
      customType,
      content,
      display,
      details,
    }
    return this.appendEntry(entry)
  }

  /** Append session metadata (the display name). Returns the entry id. */
  appendSessionInfo(name: string): string {
    const sanitizedName = name.replace(/[\r\n]+/g, ' ').trim()
    const entry: SessionInfoEntry = {
      ...this.baseEntry('session_info'),
      type: 'session_info',
      name: sanitizedName,
    }
    return this.appendEntry(entry)
  }

  /** The latest session name; an empty name explicitly clears the title. */
  getSessionName(): string | undefined {
    const entries = this.getEntries()
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      if (entry !== undefined && entry.type === 'session_info') {
        const name = (entry as SessionInfoEntry).name
        if (name === undefined) return undefined
        return name.trim() === '' ? undefined : name.trim()
      }
    }
    return undefined
  }

  /**
   * Set or clear a label on an entry. Pass undefined (or an empty string) to
   * clear. Throws when the target entry does not exist.
   */
  appendLabelChange(targetId: string, label: string | undefined): string {
    if (!this.byId.has(targetId)) {
      throw new Error('Entry ' + targetId + ' not found')
    }
    const cleared = label === undefined || label.trim() === ''
    const entry: LabelEntry = {
      ...this.baseEntry('label'),
      type: 'label',
      targetId,
      label: cleared ? undefined : label,
    }
    const entryId = this.appendEntry(entry)
    if (cleared) {
      this.labelsById.delete(targetId)
      this.labelTimestampsById.delete(targetId)
    } else {
      this.labelsById.set(targetId, label)
      this.labelTimestampsById.set(targetId, entry.timestamp)
    }
    return entryId
  }

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  getLeafId(): string | null {
    return this.leafId
  }

  getLeafEntry(): SessionEntry | undefined {
    if (this.leafId === null) return undefined
    return this.byId.get(this.leafId)
  }

  getEntry(id: string): SessionEntry | undefined {
    return this.byId.get(id)
  }

  /** Resolved label for an entry, if any. */
  getLabel(id: string): string | undefined {
    return this.labelsById.get(id)
  }

  /** Timestamp of the latest label change for an entry, if any. */
  getLabelTimestamp(id: string): string | undefined {
    return this.labelTimestampsById.get(id)
  }

  /** The session header, or null for headerless in-memory state. */
  getHeader(): SessionHeader | null {
    const header = this.fileEntries.find((entry): entry is SessionHeader => entry.type === 'session')
    return header ?? null
  }

  /** All entries excluding the header, in file order. Shallow copy. */
  getEntries(): SessionEntry[] {
    return this.fileEntries.filter((entry): entry is SessionEntry => entry.type !== 'session')
  }

  /** The active, compaction-aware entry list for context and rendering. */
  getContextEntries(): SessionEntry[] {
    return buildContextEntries(this.getEntries(), this.leafId, this.byId)
  }

  /** The session context (what gets sent to the LLM). */
  buildSessionContext(): SessionContext {
    return buildSessionContext(this.getEntries(), this.leafId, this.byId)
  }

  // -----------------------------------------------------------------------
  // Factories
  // -----------------------------------------------------------------------

  /** Create a new persisted session for a working directory. */
  static create(cwd: string, sessionDir?: string, options?: NewSessionOptions): SessionManager {
    const dir = sessionDir !== undefined ? normalizePath(sessionDir) : getDefaultSessionDir(cwd)
    return new SessionManager(cwd, dir, undefined, true, options)
  }

  /**
   * Open an existing session file. Missing files start a new session at that
   * path; non-empty files that are not sessions throw without being modified.
   */
  static open(path: string, sessionDir?: string, cwdOverride?: string): SessionManager {
    const resolvedPath = resolvePath(path)
    let header: SessionHeader | null = null
    let preloadedFileEntries: FileEntry[] | undefined

    if (cwdOverride === undefined && existsSync(resolvedPath)) {
      try {
        header = readSessionHeader(resolvedPath)
      } catch (error) {
        if (!(error instanceof SessionHeaderScanLimitError)) throw error
        // The bounded scan is a discovery optimization only. A full load stays
        // authoritative for legacy files with very large headers or prefixes.
        preloadedFileEntries = loadEntriesFromFile(resolvedPath)
        const firstEntry = preloadedFileEntries[0]
        header = firstEntry !== undefined && firstEntry.type === 'session' ? (firstEntry as SessionHeader) : null
      }
    }

    const headerCwd = header === null ? undefined : (header as { cwd?: unknown }).cwd
    const cwd =
      cwdOverride ?? (typeof headerCwd === 'string' && headerCwd !== '' ? headerCwd : undefined) ?? process.cwd()
    const dir = sessionDir !== undefined ? normalizePath(sessionDir) : join(resolvedPath, '..')
    return new SessionManager(cwd, dir, resolvedPath, true, undefined, preloadedFileEntries)
  }

  /** Continue the most recent session for a cwd, or create a new one. */
  static continueRecent(cwd: string, sessionDir?: string): SessionManager {
    const dir = sessionDir !== undefined ? normalizePath(sessionDir) : getDefaultSessionDir(cwd)
    const filterCwd = sessionDir !== undefined && dir !== getDefaultSessionDirPath(cwd)
    const mostRecent = findMostRecentSession(dir, filterCwd ? cwd : undefined)
    if (mostRecent !== null) {
      return new SessionManager(cwd, dir, mostRecent, true)
    }
    return new SessionManager(cwd, dir, undefined, true)
  }

  /** In-memory session (no file persistence), optionally seeded with entries. */
  static inMemory(
    cwd: string = process.cwd(),
    options?: NewSessionOptions,
    entries?: FileEntry[],
  ): SessionManager {
    return new SessionManager(cwd, '', undefined, false, options, entries)
  }

  /** List sessions for a working directory, newest modified first. */
  static async list(
    cwd: string,
    sessionDir?: string,
    onProgress?: SessionListProgress,
  ): Promise<SessionInfo[]> {
    const dir = sessionDir !== undefined ? normalizePath(sessionDir) : getDefaultSessionDir(cwd)
    const filterCwd = sessionDir !== undefined && dir !== getDefaultSessionDirPath(cwd)
    const resolvedCwd = resolvePath(cwd)
    const sessions = await listSessionsFromDir(dir, onProgress)
    const filtered = filterCwd ? sessions.filter((s) => sessionCwdMatches(s.cwd, resolvedCwd)) : sessions
    return sortSessionsByModified(filtered)
  }

  /** List sessions across every project directory, newest modified first. */
  static async listAll(onProgress?: SessionListProgress): Promise<SessionInfo[]> {
    const sessions = await listAllSessionsFromParent(getSessionsDir(), onProgress)
    return sortSessionsByModified(sessions)
  }
}

function sessionCwdMatches(cwd: string | undefined, resolvedCwd: string): boolean {
  return cwd !== undefined && cwd !== '' && resolvePath(cwd) === resolvedCwd
}
