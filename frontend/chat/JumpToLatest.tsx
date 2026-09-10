import React from 'react'
import { ArrowDown } from 'lucide-react'

export interface JumpToLatestProps {
  /** Shown only when the view has stopped following new content. */
  visible: boolean
  onClick: () => void
}

/**
 * The way back to the bottom once following has been released.
 *
 * Without it, a reader who scrolled up mid-reply has to find the bottom by hand
 * to see how the answer ended.
 */
export function JumpToLatest({ visible, onClick }: JumpToLatestProps): React.JSX.Element | null {
  if (!visible) return null

  return (
    <button type="button" className="jump-to-latest" onClick={onClick} aria-label="Jump to latest message">
      <ArrowDown size={15} aria-hidden="true" />
    </button>
  )
}
