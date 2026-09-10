import React, { useState } from 'react'

import { Markdown } from '../markdown'
import { thinkingLabel } from './formatDuration'
import './thinking.css'

export interface ThinkingBlockProps {
  /** Reasoning text. Empty until the first reasoning token arrives. */
  thinking: string
  /** True while reasoning is still arriving. */
  isStreaming: boolean
  /** How long reasoning took. Undefined until it finishes. */
  durationMs: number | undefined
}

/**
 * The model's reasoning, folded away behind a label.
 *
 * The label is plain text on the left edge of the message, the same edge the
 * answer starts from. No chevron, no box, no indent: anything in front of it
 * pushes the label out of line with the first word of the answer, and the two
 * are meant to read as one message.
 *
 * Folded by default, including while reasoning is still arriving. The label
 * carries the progress on its own, and the answer is what the reader is waiting
 * for: opening by itself would push the answer down the instant it started and
 * pull it back up when the reasoning stopped.
 */
export function ThinkingBlock({ thinking, isStreaming, durationMs }: ThinkingBlockProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="thinking-block">
      <button
        type="button"
        className="thinking-header"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={isStreaming ? 'shimmer-text' : undefined}>
          {thinkingLabel(isStreaming, durationMs)}
        </span>
      </button>

      {open ? (
        <div className="thinking-body">
          {/* Same renderer as the answer, with single newlines honoured: reasoning
              carries lists and code, and collapsing its newlines would run
              separate thoughts together. */}
          <Markdown breaks>{thinking}</Markdown>
        </div>
      ) : null}
    </div>
  )
}
