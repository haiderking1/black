/**
 * Branch summarization.
 *
 * When a conversation returns from exploring a different branch, this
 * summarizes the branch that was left so its context is not lost. Compaction
 * and branch summarization share file tracking and serialization. They differ
 * in what gets selected, how much room the response gets, and how failure is
 * reported: a failed compaction throws, because the caller needs a checkpoint,
 * while a failed branch summary returns an error field so navigation still
 * works.
 *
 * Ported from pi (https://github.com/earendil-works/pi, MIT, Mario Zechner) and
 * adapted to black's session types.
 */

import { buildSessionPath } from '../sessions/context'
import {
  convertToLlm,
  createBranchSummaryMessage,
  createCompactionSummaryMessage,
  createCustomMessage
} from '../sessions/messages'
import type { AgentMessage, SessionEntry } from '../sessions/types'
import { computeFileLists, createFileOps, extractFileOpsFromMessage, formatFileOperations } from './file-ops'
import { BRANCH_SUMMARY_PREAMBLE, BRANCH_SUMMARY_PROMPT, SUMMARIZATION_SYSTEM_PROMPT } from './prompts'
import { extractSummarizationText, getSummarizationFailure, summarizationTriedToolCall } from './response'
import { serializeConversation } from './serialization'
import { estimateTokens, isPresent, isUsage, zeroUsage } from './tokens'
import type {
  BranchPreparation,
  BranchSummaryDetails,
  BranchSummaryResult,
  CollectEntriesResult,
  GenerateBranchSummaryOptions
} from './types'

/** Fallback context window when the caller supplies none. */
const DEFAULT_CONTEXT_WINDOW = 128_000

/** Fallback reserve when the caller supplies none. */
const DEFAULT_BRANCH_RESERVE_TOKENS = 16_384

/** Response cap for a branch summary. Branch summaries are small by design. */
const BRANCH_SUMMARY_MAX_TOKENS = 4096

/** A summary entry may overshoot the budget while this share of it is still free. */
const SUMMARY_OVERSHOOT_SHARE = 0.9

function buildEntryIndex(entries: SessionEntry[]): Map<string, SessionEntry> {
  const index = new Map<string, SessionEntry>()
  for (const entry of entries) index.set(entry.id, entry)
  return index
}

/**
 * Entries to summarize when moving from oldLeafId to targetId: everything on
 * the old path below the deepest entry both paths share.
 *
 * The walk passes through compaction boundaries on purpose. A checkpoint on the
 * abandoned branch becomes context for the summary rather than a stopping
 * point, so nothing from the branch is dropped.
 */
export function collectEntriesForBranchSummary(
  entries: SessionEntry[],
  oldLeafId: string | null,
  targetId: string,
  byId?: Map<string, SessionEntry>
): CollectEntriesResult {
  if (oldLeafId === null || oldLeafId === '') {
    return { entries: [], commonAncestorId: null }
  }

  const index = byId ?? buildEntryIndex(entries)
  // buildSessionPath falls back to the newest entry when an id is unknown, so
  // presence is checked first. pi's getBranch yields nothing for an unknown id,
  // and the walk below relies on that: an unreachable target means the whole
  // old branch is summarized instead of stopping at a false ancestor.
  const oldPathIds = new Set(
    index.has(oldLeafId) ? buildSessionPath(entries, oldLeafId, index).map((entry) => entry.id) : []
  )
  const targetPath = index.has(targetId) ? buildSessionPath(entries, targetId, index) : []

  let commonAncestorId: string | null = null
  for (let i = targetPath.length - 1; i >= 0; i--) {
    const candidate = targetPath[i]
    if (candidate !== undefined && oldPathIds.has(candidate.id)) {
      commonAncestorId = candidate.id
      break
    }
  }

  const collected: SessionEntry[] = []
  const visited = new Set<string>()
  let current: string | null = oldLeafId
  while (current !== null && current !== '' && current !== commonAncestorId) {
    if (visited.has(current)) break
    visited.add(current)
    const entry = index.get(current)
    if (entry === undefined) break
    collected.push(entry)
    current = entry.parentId
  }

  collected.reverse()
  return { entries: collected, commonAncestorId }
}

/**
 * The message an entry contributes to a branch summary. Tool results are
 * skipped: the assistant turn that produced them is already listed, and result
 * bodies would crowd out the conversation itself.
 */
function getMessageFromEntry(entry: SessionEntry): AgentMessage | undefined {
  switch (entry.type) {
    case 'message':
      // A session file is parsed without validation, so the message can be
      // missing or null. Such an entry contributes nothing.
      if (!isPresent(entry.message)) return undefined
      if (entry.message.role === 'toolResult') return undefined
      return entry.message

    case 'custom_message':
      return createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp)

    case 'branch_summary':
      if (typeof entry.summary !== 'string' || entry.summary === '') return undefined
      return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp)

    case 'compaction':
      return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp)

    default:
      return undefined
  }
}

/**
 * Trim branch entries to a token budget, keeping the newest messages.
 *
 * File lists from earlier branch summaries are read from every entry, even ones
 * that fall outside the budget, so tracking stays cumulative down a long branch.
 * Tool calls contribute their paths before the budget check for the same reason.
 * A summary entry is admitted past the budget while most of it is still free,
 * because it is the only surviving record of everything before it.
 */
export function prepareBranchEntries(entries: SessionEntry[], tokenBudget = 0): BranchPreparation {
  const messages: AgentMessage[] = []
  const fileOps = createFileOps()
  let totalTokens = 0

  for (const entry of entries) {
    if (!isPresent(entry) || entry.type !== 'branch_summary' || entry.fromHook === true) continue
    const details = entry.details
    if (details === undefined || details === null) continue

    const summaryDetails = details as BranchSummaryDetails
    if (Array.isArray(summaryDetails.readFiles)) {
      for (const file of summaryDetails.readFiles) {
        if (typeof file === 'string' && file !== '') fileOps.read.add(file)
      }
    }
    if (Array.isArray(summaryDetails.modifiedFiles)) {
      for (const file of summaryDetails.modifiedFiles) {
        if (typeof file === 'string' && file !== '') fileOps.edited.add(file)
      }
    }
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!isPresent(entry)) continue

    const message = getMessageFromEntry(entry)
    if (message === undefined) continue

    extractFileOpsFromMessage(message, fileOps)
    const tokens = estimateTokens(message)

    if (tokenBudget > 0 && totalTokens + tokens > tokenBudget) {
      const isSummaryEntry = entry.type === 'compaction' || entry.type === 'branch_summary'
      if (isSummaryEntry && totalTokens < tokenBudget * SUMMARY_OVERSHOOT_SHARE) {
        messages.unshift(message)
        totalTokens += tokens
      }
      break
    }

    messages.unshift(message)
    totalTokens += tokens
  }

  return { messages, fileOps, totalTokens }
}

/**
 * Tokens available for branch history: the context window minus the reserve.
 *
 * pi defaults the reserve to 16384 and treats a zero window as absent. Both
 * fallbacks are repeated here, because a non-finite reserve would make the
 * budget comparison false and admit every entry instead of trimming.
 */
function branchTokenBudget(options: GenerateBranchSummaryOptions): number {
  const configuredWindow = options.contextWindow
  const contextWindow =
    typeof configuredWindow === 'number' && Number.isFinite(configuredWindow) && configuredWindow > 0
      ? configuredWindow
      : DEFAULT_CONTEXT_WINDOW

  const configuredReserve = options.reserveTokens
  const reserve =
    typeof configuredReserve === 'number' && Number.isFinite(configuredReserve) && configuredReserve >= 0
      ? configuredReserve
      : DEFAULT_BRANCH_RESERVE_TOKENS

  return contextWindow - reserve
}

function branchResponseMaxTokens(options: GenerateBranchSummaryOptions): number {
  const cap = options.maxResponseTokens
  const bounded =
    typeof cap === 'number' && Number.isFinite(cap) && cap > 0
      ? Math.min(BRANCH_SUMMARY_MAX_TOKENS, Math.floor(cap))
      : BRANCH_SUMMARY_MAX_TOKENS
  return Math.max(1, bounded)
}

function buildBranchInstructions(options: GenerateBranchSummaryOptions): string {
  const custom = options.customInstructions
  if (typeof custom !== 'string' || custom === '') return BRANCH_SUMMARY_PROMPT
  if (options.replaceInstructions === true) return custom
  return BRANCH_SUMMARY_PROMPT + '\n\nAdditional focus: ' + custom
}

/**
 * Summarize the entries of an abandoned branch.
 *
 * Failures come back as fields rather than exceptions: navigating away is still
 * valid when a summary cannot be produced, and the caller decides whether to
 * surface the problem or continue without the context.
 */
export async function generateBranchSummary(
  entries: SessionEntry[],
  options: GenerateBranchSummaryOptions
): Promise<BranchSummaryResult> {
  const tokenBudget = branchTokenBudget(options)

  const { messages, fileOps } = prepareBranchEntries(entries, tokenBudget)
  if (messages.length === 0) {
    return { summary: 'No content to summarize' }
  }

  const conversationText = serializeConversation(convertToLlm(messages))
  const promptText =
    '<conversation>\n' + conversationText + '\n</conversation>\n\n' + buildBranchInstructions(options)

  const response = await options.call({
    systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
    text: promptText,
    maxTokens: branchResponseMaxTokens(options),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {})
  })

  if (response.stopReason === 'aborted') return { aborted: true }

  const failure = getSummarizationFailure(response, 'Branch summarization')
  if (failure !== undefined) return { error: failure }

  if (summarizationTriedToolCall(response)) {
    return { error: 'Branch summarization attempted to call a tool' }
  }

  const { readFiles, modifiedFiles } = computeFileLists(fileOps)
  const summary = BRANCH_SUMMARY_PREAMBLE + extractSummarizationText(response) + formatFileOperations(readFiles, modifiedFiles)

  return {
    summary: summary === '' ? 'No summary generated' : summary,
    usage: isUsage(response.usage) ? response.usage : zeroUsage(),
    readFiles,
    modifiedFiles
  }
}
