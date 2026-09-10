import type {
  AgentMessage,
  AssistantMessage,
  CompactionEntry,
  SessionContext,
  SessionEntry,
  SessionMessageEntry,
} from './types'
import { createBranchSummaryMessage, createCompactionSummaryMessage, createCustomMessage } from './messages'

type EntryIndex = Map<string, SessionEntry>

function buildEntryIndex(entries: SessionEntry[], byId?: EntryIndex): EntryIndex {
  if (byId !== undefined) return byId
  const index: EntryIndex = new Map()
  for (const entry of entries) {
    index.set(entry.id, entry)
  }
  return index
}

/**
 * Walk from a leaf entry to the root, returning the active entry list.
 *
 * With leafId undefined the last entry acts as the leaf; leafId null means
 * "empty conversation" and yields no entries. Entries whose parent id is
 * missing from the index stop the walk (orphans cannot be linked back).
 */
export function buildSessionPath(
  entries: SessionEntry[],
  leafId?: string | null,
  byId?: EntryIndex,
): SessionEntry[] {
  const index = buildEntryIndex(entries, byId)

  let leaf: SessionEntry | undefined
  if (leafId === null) return []
  if (leafId !== undefined && leafId !== '') {
    const found = index.get(leafId)
    if (found !== undefined) leaf = found
  }
  leaf ??= entries[entries.length - 1]
  if (leaf === undefined) return []

  const path: SessionEntry[] = []
  const visited = new Set<string>()
  let current: SessionEntry | undefined = leaf

  while (current !== undefined) {
    if (visited.has(current.id)) break // parent cycle guard
    visited.add(current.id)
    path.push(current)
    const parentId: string | null | undefined = current.parentId
    current = parentId === null || parentId === undefined ? undefined : index.get(parentId)
  }

  path.reverse()
  return path
}

type SessionSettings = Pick<SessionContext, 'thinkingLevel' | 'model'>

function getSessionContextSettings(path: SessionEntry[]): SessionSettings {
  let thinkingLevel = 'off'
  let model: { provider: string; modelId: string } | null = null

  for (const entry of path) {
    if (entry.type === 'thinking_level_change') {
      thinkingLevel = entry.thinkingLevel
    } else if (entry.type === 'model_change') {
      model = { provider: entry.provider, modelId: entry.modelId }
    } else if (entry.type === 'message' && entry.message.role === 'assistant') {
      const assistant = entry.message as AssistantMessage
      model = { provider: assistant.provider, modelId: assistant.model }
    }
  }

  return { thinkingLevel, model }
}

/** An assistant message that failed or was cut short is dropped from LLM context. */
function isContextMessage(message: AgentMessage): boolean {
  if (message.role !== 'assistant') return true
  const stopReason = (message as AssistantMessage).stopReason
  return stopReason !== 'error' && stopReason !== 'aborted' && stopReason !== 'deferred'
}

/**
 * Project one selected session entry into LLM/runtime messages.
 * Plain custom entries are display/state entries and do not participate in
 * context. Session files are parsed without validation, so message content
 * that is null or missing is repaired to an empty block list.
 */
export function sessionEntryToContextMessages(entry: SessionEntry): AgentMessage[] {
  if (entry.type === 'message') {
    const message = entry.message
    if (
      (message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult') &&
      (message as { content?: unknown }).content == null
    ) {
      return [{ ...message, content: [] } as AgentMessage]
    }
    return [message]
  }
  if (entry.type === 'custom_message') {
    return [
      createCustomMessage(entry.customType, entry.content ?? [], entry.display, entry.details, entry.timestamp),
    ]
  }
  if (entry.type === 'branch_summary' && typeof entry.summary === 'string' && entry.summary !== '') {
    return [createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp)]
  }
  if (entry.type === 'compaction') {
    const summaryMessage = createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp)
    const tail = Array.isArray(entry.retainedTail) ? entry.retainedTail : []
    return [summaryMessage, ...tail.filter(isContextMessage)]
  }
  return []
}

function findLatestCompaction(path: SessionEntry[]): { compaction: CompactionEntry; index: number } | null {
  let found: { compaction: CompactionEntry; index: number } | null = null
  for (let index = 0; index < path.length; index++) {
    const entry = path[index]
    if (entry !== undefined && entry.type === 'compaction') {
      found = { compaction: entry as CompactionEntry, index }
    }
  }
  return found
}

/**
 * Build the active, compaction-aware session entry list.
 *
 * Finds the latest compaction entry on the path. When the compaction carries a
 * retainedTail it is a self-contained checkpoint: earlier path entries are
 * dropped entirely. Otherwise entries from firstKeptEntryId (when it resolves
 * on the path) up to the compaction are kept. Entries after the compaction are
 * always included. Without a compaction the full path is returned.
 */
export function buildContextEntries(
  entries: SessionEntry[],
  leafId?: string | null,
  byId?: EntryIndex,
): SessionEntry[] {
  const path = buildSessionPath(entries, leafId, byId)
  const latest = findLatestCompaction(path)
  if (latest === null) return path

  const { compaction, index: compactionIdx } = latest
  const contextEntries: SessionEntry[] = [compaction]

  if (Array.isArray(compaction.retainedTail)) {
    // Checkpoint form: the tail carries everything retained; skip the prefix.
    contextEntries.push(...path.slice(compactionIdx + 1))
    return contextEntries
  }

  let foundFirstKept = false
  for (let i = 0; i < compactionIdx; i++) {
    const entry = path[i]
    if (entry === undefined) continue
    if (!foundFirstKept && entry.id === compaction.firstKeptEntryId) {
      foundFirstKept = true
    }
    if (foundFirstKept) contextEntries.push(entry)
  }
  contextEntries.push(...path.slice(compactionIdx + 1))
  return contextEntries
}

/**
 * Build the session context (what gets sent to the LLM).
 * If leafId is provided, walks from that entry to the root.
 * Handles compaction checkpoints and branch summaries along the path.
 */
export function buildSessionContext(
  entries: SessionEntry[],
  leafId?: string | null,
  byId?: Map<string, SessionEntry>,
): SessionContext {
  const path = buildSessionPath(entries, leafId, byId)
  const { thinkingLevel, model } = getSessionContextSettings(path)
  const contextEntries = buildContextEntries(entries, leafId, byId)
  const messages = contextEntries.flatMap(sessionEntryToContextMessages)
  return { messages, thinkingLevel, model }
}

/** Find the most recent compaction entry in a list, scanning from the end. */
export function getLatestCompactionEntry(entries: SessionEntry[]): CompactionEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry !== undefined && entry.type === 'compaction') {
      return entry as CompactionEntry
    }
  }
  return null
}

export type {
  AgentMessage,
  AssistantMessage,
  SessionContext,
  SessionEntry,
  SessionMessageEntry,
}
