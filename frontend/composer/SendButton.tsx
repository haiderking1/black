import React from 'react'
import { ArrowUp, Square } from 'lucide-react'

interface SendButtonProps {
  /** True while a reply is arriving, which turns the button into a stop control. */
  streaming?: boolean
  disabled: boolean
  onClick: () => void
}

/**
 * Send, or stop while a reply is arriving.
 *
 * One control rather than two, because the two are never useful at once.
 * Sending while a reply streams still works: Enter in the composer queues the
 * turn, and the queue drains when the reply ahead of it finishes.
 */
export function SendButton({ streaming = false, disabled, onClick }: SendButtonProps): React.JSX.Element {
  if (streaming) {
    return (
      <button
        type="button"
        className="composer-send-btn active"
        onClick={onClick}
        aria-label="Stop response"
        title="Stop"
      >
        <Square size={13} strokeWidth={2.5} fill="currentColor" />
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`composer-send-btn ${disabled ? 'disabled' : 'active'}`}
      disabled={disabled}
      onClick={onClick}
      aria-label="Send message"
    >
      <ArrowUp size={16} strokeWidth={2.5} />
    </button>
  )
}
