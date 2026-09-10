import React from 'react'

import { formatTokens } from '../format/tokens'
import './compaction.css'

export interface CompactionNoticeProps {
  /** Tokens before the checkpoint, as the server measured them. */
  tokensBefore: number
  /** Tokens after, measured the same way. */
  tokensAfter: number | undefined
  /** True while the turn is still running and nothing has been produced yet. */
  isStreaming: boolean
}

/**
 * A checkpoint happened during this turn.
 *
 * Shown rather than silent, because compaction drops turns from the context. A
 * reader who scrolls back and finds the model has forgotten something needs
 * something on screen explaining it, and the alternative is a model that looks
 * like it is losing its mind.
 *
 * Shimmers while the turn is still working and settles once it lands, matching
 * the reasoning line it sits above.
 */
export function CompactionNotice({
  tokensBefore,
  tokensAfter,
  isStreaming
}: CompactionNoticeProps): React.JSX.Element {
  const size =
    tokensAfter === undefined
      ? formatTokens(tokensBefore) + ' tokens'
      : formatTokens(tokensBefore) + ' \u2192 ' + formatTokens(tokensAfter)

  return (
    <div className="compaction-notice">
      <span className={isStreaming ? 'shimmer-text' : undefined}>Context compacted</span>
      <span className="compaction-notice-size">{size}</span>
    </div>
  )
}
