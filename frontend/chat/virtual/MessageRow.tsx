import React, { memo } from 'react'

import type { Message } from '../types'
import { PreviewImage } from '../../lightbox'
import { directionFor, langFor, useLanguage } from '../../language'
import { useT } from '../../i18n'
import { WorkingSection } from '../../working/WorkingSection'

export interface MessageRowProps {
  message: Message
  active: boolean
  canRetry: boolean
  onRetry: (messageId: string) => void
  onExpandedChange: (messageId: string, expanded: boolean, blockKey?: string) => void
}

function MessageRowImpl({ message, active, canRetry, onRetry, onExpandedChange }: MessageRowProps): React.JSX.Element {
  const language = useLanguage()
  const t = useT()

  return (
    <div
      className={message.role === 'user' ? 'user-turn' : 'assistant-turn'}
      style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
    >
      <div
        style={{
          maxWidth: message.role === 'user' ? '75%' : '100%',
          padding: message.role === 'user' ? '10px 16px' : '4px 0',
          borderRadius: message.role === 'user' ? '18px' : '0',
          backgroundColor: message.role === 'user' ? 'var(--bg-surface)' : 'transparent',
          border: message.role === 'user' ? '1px solid var(--border-subtle)' : 'none',
          color: 'var(--text-primary)',
          fontSize: '15px',
          lineHeight: '1.6',
        }}
      >
        {message.role === 'assistant' ? (
          <WorkingSection
            message={message}
            active={active}
            {...(canRetry ? { onRetry: () => onRetry(message.id) } : {})}
            onExpandedChange={(expanded, blockKey) => onExpandedChange(message.id, expanded, blockKey)}
          />
        ) : (
          <>
            {message.images === undefined || message.images.length === 0 ? null : (
              <div className="message-images">
                {message.images.map((image, index) => (
                  <PreviewImage
                    key={String(index) + image.mimeType}
                    className="message-image"
                    src={'data:' + image.mimeType + ';base64,' + image.data}
                    {...(image.name === undefined ? {} : { name: image.name })}
                    alt={t('chat.attachedImage')}
                  />
                ))}
              </div>
            )}
            {message.content === '' ? null : (
              <span
                className="user-message-text"
                dir={directionFor(language, message.content)}
                lang={langFor(language, message.content)}
              >
                {message.content}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export const MessageRow = memo(MessageRowImpl)
