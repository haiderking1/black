/**
 * Compaction preparation: work out what gets summarized and what stays.
 *
 * Nothing here mutates the session. The result is a plan that compact() turns
 * into a summary, and that a caller may inspect before spending a model call
 * on it.
 */

import type { AgentMessage, CompactionEntry, SessionEntry } from '../sessions/types'
import { buildSessionContext, sessionEntryToContextMessages } from '../sessions/context'
import { findCutPoint } from './cut-point'
import { extractFileOperations, extractFileOpsFromMessage } from './file-ops'
import { estimateContextTokens } from './tokens'
import type { CompactionPreparation, ResolvedCompactionSettings } from './types'

/**
 * The message an entry contributes to LLM context. Entries that contribute
 * several messages yield their first here, and a compaction entry yields
 * nothing because its summary is regenerated rather than re-summarized.
 */
function getMessageFromEntryForCompaction(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === 'compaction') return undefined
  return sessionEntryToContextMessages(entry)[0]
}

/**
 * Build the compaction plan for a session path, or undefined when there is
 * nothing worth compacting.
 *
 * The boundary starts after the previous compaction so its summary is updated
 * rather than folded in twice. When that compaction's firstKeptEntryId no
 * longer resolves on the path, the boundary falls back to the entry after it.
 */
export function prepareCompaction(
  pathEntries: SessionEntry[],
  settings: ResolvedCompactionSettings
): CompactionPreparation | undefined {
  const lastEntry = pathEntries[pathEntries.length - 1]
  if (lastEntry !== undefined && lastEntry.type === 'compaction') return undefined

  let prevCompactionIndex = -1
  for (let i = pathEntries.length - 1; i >= 0; i--) {
    const entry = pathEntries[i]
    if (entry !== undefined && entry.type === 'compaction') {
      prevCompactionIndex = i
      break
    }
  }

  let previousSummary: string | undefined
  let boundaryStart = 0
  if (prevCompactionIndex >= 0) {
    const prevCompaction = pathEntries[prevCompactionIndex] as CompactionEntry
    previousSummary = prevCompaction.summary
    const firstKeptEntryIndex = pathEntries.findIndex((entry) => entry.id === prevCompaction.firstKeptEntryId)
    boundaryStart = firstKeptEntryIndex >= 0 ? firstKeptEntryIndex : prevCompactionIndex + 1
  }
  const boundaryEnd = pathEntries.length

  const tokensBefore = estimateContextTokens(buildSessionContext(pathEntries).messages).tokens
  const cutPoint = findCutPoint(pathEntries, boundaryStart, boundaryEnd, settings.keepRecentTokens)

  const firstKeptEntry = pathEntries[cutPoint.firstKeptEntryIndex]
  if (firstKeptEntry === undefined || typeof firstKeptEntry.id !== 'string' || firstKeptEntry.id === '') {
    // The cut needs a stable entry id to point at.
    return undefined
  }

  const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex

  const messagesToSummarize: AgentMessage[] = []
  for (let i = boundaryStart; i < historyEnd; i++) {
    const entry = pathEntries[i]
    if (entry === undefined) continue
    const message = getMessageFromEntryForCompaction(entry)
    if (message !== undefined) messagesToSummarize.push(message)
  }

  const turnPrefixMessages: AgentMessage[] = []
  if (cutPoint.isSplitTurn) {
    for (let i = cutPoint.turnStartIndex; i < cutPoint.firstKeptEntryIndex; i++) {
      const entry = pathEntries[i]
      if (entry === undefined) continue
      const message = getMessageFromEntryForCompaction(entry)
      if (message !== undefined) turnPrefixMessages.push(message)
    }
  }

  if (messagesToSummarize.length === 0 && turnPrefixMessages.length === 0) return undefined

  const fileOps = extractFileOperations(messagesToSummarize, pathEntries, prevCompactionIndex)
  if (cutPoint.isSplitTurn) {
    for (const message of turnPrefixMessages) extractFileOpsFromMessage(message, fileOps)
  }

  return {
    firstKeptEntryId: firstKeptEntry.id,
    messagesToSummarize,
    turnPrefixMessages,
    isSplitTurn: cutPoint.isSplitTurn,
    tokensBefore,
    previousSummary,
    fileOps,
    settings
  }
}
