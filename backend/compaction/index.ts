/**
 * Compaction and branch summarization: summarize older context so it keeps
 * fitting, and summarize abandoned branches so their work is not lost.
 *
 * The algorithms here are ported from pi
 * (https://github.com/earendil-works/pi, MIT, Mario Zechner) and adapted to
 * black's session types. See the NOTICE file for the upstream attribution.
 *
 * Nothing in this directory touches a provider or the filesystem. The single
 * model call arrives as an injected SummarizationCall, and the caller decides
 * what to persist. CompactionResult feeds SessionManager.appendCompaction() and
 * BranchSummaryResult feeds SessionManager.appendBranchSummary().
 *
 * A caller that wants transient failures retried composes the two:
 *
 *   const call = retrySummarizationCall(
 *     providerCall,
 *     summarizationRetryPolicy(settings.getRetrySettings(), settings.getProviderRetrySettings())
 *   )
 */

export { collectEntriesForBranchSummary, generateBranchSummary, prepareBranchEntries } from './branch-summarization'
export { compact } from './compact'
export { findCutPoint, findTurnStartIndex } from './cut-point'
export {
  computeFileLists,
  createFileOps,
  extractFileOperations,
  extractFileOpsFromMessage,
  formatFileOperations
} from './file-ops'
export { prepareCompaction } from './prepare'
export {
  BRANCH_SUMMARY_PREAMBLE,
  BRANCH_SUMMARY_PROMPT,
  SUMMARIZATION_PROMPT,
  SUMMARIZATION_SYSTEM_PROMPT,
  TURN_PREFIX_SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT
} from './prompts'
export { extractSummarizationText, getSummarizationFailure, summarizationTriedToolCall } from './response'
export {
  DEFAULT_MAX_RETRY_DELAY_MS,
  isRetryableSummarizationError,
  retryDelayMs,
  retrySummarizationCall,
  summarizationRetryPolicy
} from './retry'
export type { RetryCallbacks, RetryPolicy } from './retry'
export { serializeConversation } from './serialization'
export {
  generateSummary,
  generateSummaryWithUsage,
  generateTurnPrefixSummary
} from './summarize'
export {
  calculateContextTokens,
  combineUsage,
  estimateContextTokens,
  estimateMessagesTokens,
  estimateTokens,
  getLastAssistantUsage,
  isUsage,
  shouldCompact,
  zeroUsage
} from './tokens'
export * from './types'
