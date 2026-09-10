import { compact, estimateMessagesTokens, prepareCompaction, shouldCompact } from '../compaction'
import type { ResolvedCompactionSettings, SummarizationCall, SummarizationOptions } from '../compaction'
import { messagesFrom, summaryBlock, toEntries, type TranscriptMessage } from './transcript'

/**
 * What a transcript measures, by the same estimate the trigger uses.
 *
 * Exported so the reading shown to the reader and the reading that decides
 * compaction are the same number, rather than two estimates that disagree.
 */
export function measureContext(messages: readonly TranscriptMessage[]): number {
  return estimateMessagesTokens(toEntries(messages).map((entry) => entry.message))
}

export interface FitContextOptions {
  messages: readonly TranscriptMessage[]
  /** How much the model can take, from the catalog rather than a guess. */
  contextWindow: number
  settings: ResolvedCompactionSettings
  /** One summarization round trip, supplied by the caller. */
  call: SummarizationCall
  /** Compact regardless of how full the context is. */
  force?: boolean
  sessionId?: string
}

export interface FittedContext {
  messages: readonly TranscriptMessage[]
  /** True when older turns were folded into a summary. */
  compacted: boolean
  tokensBefore: number
  /** What the fitted transcript measures, so the drop can be reported. */
  tokensAfter: number
  /** Present when a checkpoint was made, ready to stand in for the turns it replaces. */
  summary?: string
  /** Id of the first message kept, so a caller can resume its own transcript. */
  firstKeptId?: string
}

/**
 * Fits a transcript into the model's window, summarizing the older part when it
 * will not.
 *
 * Every turn used to be sent whole. Nothing measured it, so a long enough
 * conversation was rejected by the provider outright and the thread was over.
 * This is the measurement and the fix, applied before each request.
 *
 * A summarization that produces nothing leaves the transcript alone. That
 * happens when the turn was cancelled, or when the provider returned an empty
 * summary after retries. Sending the original is a request that may be too
 * large; replacing history with an empty checkpoint loses the conversation
 * permanently. The first is recoverable by the reader, the second is not.
 */
export async function fitContext(options: FitContextOptions): Promise<FittedContext> {
  const { messages, contextWindow, settings, call, force = false, sessionId } = options

  const entries = toEntries(messages)
  const tokensBefore = measureContext(messages)

  if (!force && !shouldCompact(tokensBefore, contextWindow, settings)) {
    return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore }
  }

  const preparation = prepareCompaction(entries, settings)
  if (preparation === undefined) {
    return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore }
  }

  const summarization: SummarizationOptions = {
    reserveTokens: settings.reserveTokens,
    call,
    ...(sessionId !== undefined ? { sessionId } : {})
  }

  const result = await compact(preparation, summarization)

  if (result.summary.trim() === '') {
    return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore }
  }

  const kept = messagesFrom(messages, result.firstKeptEntryId)

  const fitted: TranscriptMessage[] = [
    { id: 'compaction-summary', role: 'system', content: summaryBlock(result.summary) },
    ...kept
  ]

  return {
    messages: fitted,
    compacted: true,
    summary: summaryBlock(result.summary),
    firstKeptId: result.firstKeptEntryId,
    tokensBefore,
    // Measured the same way as tokensBefore, so the pair is comparable rather
    // than one estimate next to one provider figure.
    tokensAfter: estimateMessagesTokens(toEntries(fitted).map((entry) => entry.message))
  }
}
