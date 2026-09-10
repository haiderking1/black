/**
 * Shared compaction types.
 *
 * The compaction algorithms in this directory are ported from pi
 * (https://github.com/earendil-works/pi, MIT, Mario Zechner) and adapted to
 * black's session types. pi calls a provider model directly; black has no
 * provider layer yet, so the single LLM round trip arrives as an injected
 * SummarizationCall instead.
 */

import type { CompactionSettings } from '../config/settings/types'
import type { AgentMessage, AssistantMessage, SessionEntry, Usage } from '../sessions/types'

/** Compaction settings with every default already resolved. */
export type ResolvedCompactionSettings = Required<CompactionSettings>

/** File paths touched by tool calls, split by the operation that touched them. */
export interface FileOperations {
  read: Set<string>
  written: Set<string>
  edited: Set<string>
}

/** Extension payload persisted on a compaction entry alongside the summary. */
export interface CompactionDetails {
  readFiles?: string[]
  modifiedFiles?: string[]
}

/** What compact() returns. SessionManager supplies id, parentId, and timestamp. */
export interface CompactionResult<TDetails = unknown> {
  summary: string
  firstKeptEntryId: string
  tokensBefore: number
  /**
   * Size of the context once the checkpoint is applied. compact() cannot fill
   * this in, because the context only exists after the entry is appended and
   * the session rebuilds. The session layer sets it, measuring the rebuilt
   * context with estimateMessagesTokens().
   */
  estimatedTokensAfter?: number
  /** Usage from the summarization call, when the caller reports one. */
  usage?: Usage
  details?: TDetails
}

export interface ContextUsageEstimate {
  tokens: number
  /** Tokens reported by the last assistant usage, or 0 when there is none. */
  usageTokens: number
  /** Tokens estimated for messages after that usage. */
  trailingTokens: number
  /** Index of the message that supplied the usage, or null. */
  lastUsageIndex: number | null
}

export interface CutPointResult {
  /** Index of the first entry to keep. */
  firstKeptEntryIndex: number
  /** Index of the turn-starting message being split, or -1 when not splitting. */
  turnStartIndex: number
  /** True when the cut lands inside a turn rather than on a turn boundary. */
  isSplitTurn: boolean
}

/** Everything compact() needs, computed from the session path up front. */
export interface CompactionPreparation {
  /** Id of the first entry retained after the cut. */
  firstKeptEntryId: string
  /** Messages folded into the summary and then dropped from context. */
  messagesToSummarize: AgentMessage[]
  /** Leading messages of a split turn, summarized separately. */
  turnPrefixMessages: AgentMessage[]
  isSplitTurn: boolean
  tokensBefore: number
  /** Summary from the previous compaction, when merging forward. */
  previousSummary?: string
  fileOps: FileOperations
  settings: ResolvedCompactionSettings
}

/** One summarization round trip, described without naming a provider. */
export interface SummarizationRequest {
  systemPrompt: string
  /** Serialized conversation followed by the instruction block. */
  text: string
  maxTokens: number
  /** Routing id for providers that skip cache writes on one-off requests. */
  sessionId?: string
  signal?: AbortSignal
}

/**
 * Provider-free summarization hook. Returning a normal assistant message keeps
 * the caller's stop reason, usage, and error text flowing through the failure
 * checks unchanged.
 */
export type SummarizationCall = (request: SummarizationRequest) => Promise<AssistantMessage>

/** Result of a branch summarization attempt. Failures arrive as fields, not throws. */
export interface BranchSummaryResult {
  summary?: string
  usage?: Usage
  readFiles?: string[]
  modifiedFiles?: string[]
  /** True when the caller aborted before the model answered. */
  aborted?: boolean
  /** Human-readable failure reason. */
  error?: string
}

/** File tracking payload persisted on a branch summary entry. */
export interface BranchSummaryDetails {
  readFiles: string[]
  modifiedFiles: string[]
}

/** Entries trimmed to a token budget, ready to summarize. */
export interface BranchPreparation {
  /** Messages in chronological order. */
  messages: AgentMessage[]
  fileOps: FileOperations
  totalTokens: number
}

export interface CollectEntriesResult {
  entries: SessionEntry[]
  /** Deepest entry shared by the old and the new position, or null. */
  commonAncestorId: string | null
}

export interface GenerateBranchSummaryOptions extends SummarizationOptions {
  /** Context window used to derive the token budget. Defaults to 128000. */
  contextWindow?: number
  /** Use customInstructions on their own instead of appending them. */
  replaceInstructions?: boolean
}

export interface SummarizationOptions {
  /** Context budget the summary has to leave room for. */
  reserveTokens: number
  call: SummarizationCall
  /** Extra focus appended to the prompt. */
  customInstructions?: string
  /** Prior summary to merge into instead of starting over. */
  previousSummary?: string
  /**
   * Hard cap on response tokens, applied on top of the share of reserveTokens
   * this call site is allowed. Defaults to no cap.
   */
  maxResponseTokens?: number
  sessionId?: string
  signal?: AbortSignal
}
