import React from 'react'
import { ArrowRight, CornerDownRight, Trash2 } from 'lucide-react'

import { directionFor, langFor, useLanguage } from '../language'
import { useT } from '../i18n'
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
  const language = useLanguage()
  const t = useT()
  if (messages.length === 0) return null

  return (
    <div className="queued-messages">
      <div className="queued-card">
        {messages.map((message) => (
          <div key={message.requestId} className="queued-card-row">
            <CornerDownRight className="queued-card-icon rtl-flip" size={15} aria-hidden="true" />
            <span className="queued-card-text" dir={directionFor(language, message.content)} lang={langFor(language, message.content)}>
              {message.content}
            </span>

            <div className="queued-card-actions">
              <button
                type="button"
                className="queued-card-action"
                onClick={() => onSteer(message.requestId)}
                title={t('composer.sendNowTitle')}
              >
                <ArrowRight size={13} aria-hidden="true" className="rtl-flip" />
                <span>{t('composer.sendNow')}</span>
              </button>
              <button
                type="button"
                className="queued-card-action"
                onClick={() => onDismiss(message.requestId)}
                aria-label={t('composer.removeQueued')}
                title={t('composer.remove')}
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
