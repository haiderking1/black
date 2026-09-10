import React, { useEffect, useMemo, useState } from 'react'
import { ComposerInput } from './ComposerInput'
import { ComposerActions } from './ComposerActions'
import { ModelPicker } from './ModelPicker'
import { SendButton } from './SendButton'
import { ThinkingPicker } from './ThinkingPicker'
import { useModels } from './useModels'
import { clampThinkingLevel, thinkingOptionsFor } from './thinkingOptions'
import './composer.css'
import './pickers.css'

export interface ComposerSubmitOptions {
  /** Model the message was composed for. */
  model?: string
  /** Reasoning effort chosen alongside it. */
  thinkingLevel?: string
  [key: string]: unknown
}

export interface ComposerProps {
  onSendMessage?: (content: string, options?: ComposerSubmitOptions) => void
  disabled?: boolean
  placeholder?: string
  onAttachClick?: () => void
  /** Which provider's catalog to offer. */
  providerId?: string
  /** Display name of that provider, from its descriptor. */
  providerName?: string
  /**
   * Selected model, or null to fall back to the provider's first. Controlled so
   * the choice survives a remount, which it did not when held locally.
   */
  model: string | null
  onSelectModel: (modelId: string) => void
  thinkingLevel: string
  onSelectThinkingLevel: (level: string) => void
  /** True while a reply is arriving. Turns send into stop. */
  streaming?: boolean
  /** Stop the reply that is arriving. */
  onStop?: () => void
}

export function Composer({
  onSendMessage,
  disabled = false,
  placeholder = 'Message Black...',
  onAttachClick,
  providerId = 'opencode-go',
  providerName,
  model,
  onSelectModel,
  thinkingLevel,
  onSelectThinkingLevel,
  streaming = false,
  onStop
}: ComposerProps): React.JSX.Element {
  const [text, setText] = useState('')

  const { models, isLoading, error } = useModels(providerId)

  // Fall back to the first model the provider serves until one is chosen, so
  // the picker never shows a choice that does not exist.
  const activeModelId = model ?? models[0]?.id ?? null
  const activeModel = useMemo(
    () => models.find((candidate) => candidate.id === activeModelId) ?? null,
    [models, activeModelId]
  )

  // Options come from the model, since vendors disagree on which levels exist.
  const thinking = useMemo(() => thinkingOptionsFor(activeModel), [activeModel])

  // A level valid for the previous model is usually invalid for the next one.
  // Without this, switching from a model that takes 'max' to one that does not
  // would keep sending 'max' until the user noticed.
  useEffect(() => {
    const clamped = clampThinkingLevel(thinkingLevel, thinking.choices)
    if (clamped !== thinkingLevel) onSelectThinkingLevel(clamped)
  }, [thinkingLevel, thinking.choices, onSelectThinkingLevel])

  const canSend = text.trim().length > 0 && !disabled

  const handleSend = (): void => {
    if (!canSend) return
    const content = text.trim()
    onSendMessage?.(content, {
      ...(activeModelId !== null ? { model: activeModelId } : {}),
      thinkingLevel
    })
    setText('')
  }

  return (
    <div className="composer-wrapper">
      <div className="composer-capsule">
        <ComposerInput
          value={text}
          onChange={setText}
          onSubmit={handleSend}
          /* While a reply is arriving the next message is a follow-up, not a
             fresh request. */
          placeholder={streaming ? 'Send follow-up' : placeholder}
          disabled={disabled}
        />

        <div className="composer-toolbar">
          {/* The pickers sit with the attach button rather than beside send.
              They decide what the message goes out as, so they belong with the
              control that shapes it, not the one that fires it. */}
          <div className="composer-actions-left">
            <ComposerActions onAttachClick={onAttachClick} />
            <ModelPicker
              models={models}
              selectedModelId={activeModelId}
              onSelect={onSelectModel}
              providerId={providerId}
              {...(providerName !== undefined ? { providerName } : {})}
              isLoading={isLoading}
              error={error}
            />
            <ThinkingPicker
              value={thinkingLevel}
              choices={thinking.choices}
              onSelect={onSelectThinkingLevel}
              disabled={thinking.disabled}
              note={thinking.note}
            />
          </div>

          <div className="composer-actions-right">
            <SendButton
              streaming={streaming}
              disabled={!canSend}
              onClick={() => {
                if (streaming) {
                  onStop?.()
                  return
                }
                handleSend()
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
