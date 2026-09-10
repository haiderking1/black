/**
 * Cut point selection: where the retained tail of a conversation starts.
 *
 * A cut never lands on a tool result, because a tool result has to stay with
 * the call that produced it. Cutting on an assistant message keeps its tool
 * results, since those follow it.
 */

import type { AgentMessage, SessionEntry } from '../sessions/types'
import { sessionEntryToContextMessages } from '../sessions/context'
import type { CutPointResult } from './types'
import { estimateTokens, isPresent } from './tokens'

/** Messages a cut may land on. Tool results are excluded. */
function isCutPointMessage(message: AgentMessage): boolean {
  switch (message.role) {
    case 'user':
    case 'assistant':
    case 'bashExecution':
    case 'custom':
    case 'branchSummary':
    case 'compactionSummary':
      return true
    default:
      return false
  }
}

/** Messages that open a turn: everything except an assistant reply or tool result. */
function isTurnStartMessage(message: AgentMessage): boolean {
  switch (message.role) {
    case 'user':
    case 'bashExecution':
    case 'custom':
    case 'branchSummary':
    case 'compactionSummary':
      return true
    default:
      return false
  }
}

/** A compaction entry carries the previous summary and never opens a turn. */
function isTurnStartEntry(entry: SessionEntry): boolean {
  if (entry.type === 'compaction') return false
  return sessionEntryToContextMessages(entry).some(isTurnStartMessage)
}

/** Indexes between startIndex and endIndex where a cut is allowed. */
function findValidCutPoints(entries: SessionEntry[], startIndex: number, endIndex: number): number[] {
  const cutPoints: number[] = []
  for (let i = startIndex; i < endIndex; i++) {
    const entry = entries[i]
    if (!isPresent(entry) || entry.type === 'compaction') continue
    const previous = entries[i - 1]
    if (entry.type === 'message' && entry.turnId !== undefined && previous?.type === 'message' && previous.turnId === entry.turnId) continue
    if (sessionEntryToContextMessages(entry).some(isCutPointMessage)) cutPoints.push(i)
  }
  return cutPoints
}

/**
 * Index of the message that opened the turn containing entryIndex, or -1 when
 * no turn start sits at or after startIndex.
 */
export function findTurnStartIndex(entries: SessionEntry[], entryIndex: number, startIndex: number): number {
  for (let i = entryIndex; i >= startIndex; i--) {
    const entry = entries[i]
    if (isPresent(entry) && isTurnStartEntry(entry)) return i
  }
  return -1
}

/**
 * Choose the index that starts the retained tail, targeting keepRecentTokens.
 *
 * Walks backwards from the newest entry accumulating estimated message sizes,
 * then snaps to the nearest valid cut point at or after the entry that crossed
 * the budget. Metadata entries that contribute no context are pulled in so they
 * stay adjacent to the entries they describe.
 */
export function findCutPoint(
  entries: SessionEntry[],
  startIndex: number,
  endIndex: number,
  keepRecentTokens: number,
): CutPointResult {
  const cutPoints = findValidCutPoints(entries, startIndex, endIndex)

  if (cutPoints.length === 0) {
    return { firstKeptEntryIndex: startIndex, turnStartIndex: -1, isSplitTurn: false }
  }

  let accumulatedTokens = 0
  let cutIndex = cutPoints[0] ?? startIndex

  for (let i = endIndex - 1; i >= startIndex; i--) {
    const entry = entries[i]
    if (!isPresent(entry)) continue

    const messageTokens = sessionEntryToContextMessages(entry).reduce(
      (sum, message) => sum + estimateTokens(message),
      0,
    )
    if (messageTokens === 0) continue
    accumulatedTokens += messageTokens

    if (accumulatedTokens >= keepRecentTokens) {
      for (const cutPoint of cutPoints) {
        if (cutPoint >= i) {
          cutIndex = cutPoint
          break
        }
      }
      break
    }
  }

  while (cutIndex > startIndex) {
    const prevEntry = entries[cutIndex - 1]
    if (!isPresent(prevEntry)) break
    if (prevEntry.type === 'compaction' || sessionEntryToContextMessages(prevEntry).length > 0) break
    cutIndex--
  }

  const cutEntry = entries[cutIndex]
  const startsTurn = isPresent(cutEntry) && isTurnStartEntry(cutEntry)
  const turnStartIndex = startsTurn ? -1 : findTurnStartIndex(entries, cutIndex, startIndex)

  return {
    firstKeptEntryIndex: cutIndex,
    turnStartIndex,
    isSplitTurn: !startsTurn && turnStartIndex !== -1,
  }
}
