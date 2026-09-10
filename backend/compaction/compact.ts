/**
 * Compaction: turn a preparation into a summary plus the entry to keep from.
 *
 * A split turn produces two summaries and merges them, one for the history
 * before the turn and one for the turn's opening prefix. The prefix is too
 * large to retain, but the part that survives cannot be read without it.
 */

import { computeFileLists, formatFileOperations } from './file-ops'
import { generateSummaryWithUsage, generateTurnPrefixSummary } from './summarize'
import { combineUsage, zeroUsage } from './tokens'
import type { CompactionPreparation, CompactionResult, SummarizationOptions } from './types'

/** Marker separating the merged halves of a split turn summary. */
const TURN_CONTEXT_MARKER = '\n\n---\n\n**Turn Context (split turn):**\n\n'

/**
 * Generate the summary for a prepared compaction.
 *
 * The returned summary already carries the read-files and modified-files
 * blocks, so appending it to the session is a single call to
 * SessionManager.appendCompaction().
 *
 * An aborted summarization returns empty text rather than raising, so the
 * caller owns the abort guard: check the signal after this resolves and before
 * appending, the way pi's session layer does. Persisting without that check
 * would replace real history with an empty checkpoint.
 */
export async function compact<TDetails = unknown>(
  preparation: CompactionPreparation,
  options: SummarizationOptions
): Promise<CompactionResult<TDetails>> {
  const {
    firstKeptEntryId,
    messagesToSummarize,
    turnPrefixMessages,
    isSplitTurn,
    tokensBefore,
    previousSummary,
    fileOps,
    settings
  } = preparation

  const sharedOptions: SummarizationOptions = { ...options, reserveTokens: settings.reserveTokens }
  const summaryOptions: SummarizationOptions =
    previousSummary !== undefined ? { ...sharedOptions, previousSummary } : sharedOptions

  let summary: string
  let summaryUsage

  if (isSplitTurn && turnPrefixMessages.length > 0) {
    let historyText = 'No prior history.'
    let historyUsage = zeroUsage()

    if (messagesToSummarize.length > 0) {
      const historyResult = await generateSummaryWithUsage(messagesToSummarize, summaryOptions)
      historyText = historyResult.text
      historyUsage = historyResult.usage
    }

    const prefixResult = await generateTurnPrefixSummary(turnPrefixMessages, sharedOptions)
    summary = historyText + TURN_CONTEXT_MARKER + prefixResult.text
    summaryUsage = combineUsage(historyUsage, prefixResult.usage)
  } else {
    const result = await generateSummaryWithUsage(messagesToSummarize, summaryOptions)
    summary = result.text
    summaryUsage = result.usage
  }

  const { readFiles, modifiedFiles } = computeFileLists(fileOps)
  summary += formatFileOperations(readFiles, modifiedFiles)

  if (typeof firstKeptEntryId !== 'string' || firstKeptEntryId === '') {
    throw new Error('First kept entry has no id; the session may need migration')
  }

  return {
    summary,
    firstKeptEntryId,
    tokensBefore,
    usage: summaryUsage,
    details: { readFiles, modifiedFiles } as TDetails
  }
}
