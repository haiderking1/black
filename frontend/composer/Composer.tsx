import React, { useState } from 'react'
import { ComposerInput } from './ComposerInput'
import { ComposerActions } from './ComposerActions'
import { SendButton } from './SendButton'
import './composer.css'

export interface ComposerSubmitOptions {
  [key: string]: unknown
}

export interface ComposerProps {
  onSendMessage?: (content: string, options?: ComposerSubmitOptions) => void
  disabled?: boolean
  placeholder?: string
  onAttachClick?: () => void
}

export function Composer({
  onSendMessage,
  disabled = false,
  placeholder = 'Message Black...',
  onAttachClick
}: ComposerProps): React.JSX.Element {
  const [text, setText] = useState('')

  const canSend = text.trim().length > 0 && !disabled

  const handleSend = () => {
    if (!canSend) return
    const content = text.trim()
    onSendMessage?.(content)
    setText('')
  }

  return (
    <div className="composer-wrapper">
      <div className="composer-capsule">
        <ComposerInput
          value={text}
          onChange={setText}
          onSubmit={handleSend}
          placeholder={placeholder}
          disabled={disabled}
        />

        <div className="composer-toolbar">
          <ComposerActions onAttachClick={onAttachClick} />

          <div className="composer-actions-right">
            <SendButton disabled={!canSend} onClick={handleSend} />
          </div>
        </div>
      </div>

      <div className="composer-disclaimer">
        Black can make mistakes. Verify important code and data.
      </div>
    </div>
  )
}
