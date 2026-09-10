import React from 'react'
import { ArrowRight, CornerDownRight, Trash2 } from 'lucide-react'

import './queued.css'

export interface QueuedMessageItem {
  requestId: string
  content: string
}

export interface QueuedMessagesProps {
  messages: readonly QueuedMessageItem[]
  /** Drop one queued turn. */
  onDismiss: (requestId: string) => void
  /** Stop the reply that is running and send this one next. */
  onSteer: (requestId: string) => void
}

/**
 * Turns typed while a reply was arriving.
 *
 * Drawn as a tab behind the composer rather than a card above it. It is narrower
 * than the composer, rounded only where it is exposed, and the composer sits
 * over its lower edge, so it looks like something waiting its turn rather than a
 * second box competing with the one you are typing into.
 */
export function QueuedMessages({
  messages,
  onDismiss,
  onSteer
}: QueuedMessagesProps): React.JSX.Element | null {
  if (messages.length === 0) return null

  return (
    <div className="queued-messages">
      <div className="queued-card">
        {messages.map((message) => (
          <div key={message.requestId} className="queued-card-row">
            <CornerDownRight className="queued-card-icon" size={15} aria-hidden="true" />
            <span className="queued-card-text">{message.content}</span>

            <div className="queued-card-actions">
              <button
                type="button"
                className="queued-card-action"
                onClick={() => onSteer(message.requestId)}
                title="Stop the current reply and send this next"
              >
                <ArrowRight size={13} aria-hidden="true" />
                <span>Send now</span>
              </button>
              <button
                type="button"
                className="queued-card-action"
                onClick={() => onDismiss(message.requestId)}
                aria-label="Remove queued message"
                title="Remove"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
