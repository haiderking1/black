import React, { useEffect, useMemo, useState } from 'react'
import { ComposerInput } from './ComposerInput'
import { ComposerActions } from './ComposerActions'
import { ContextRing } from './ContextRing'
import { SlashMenu } from './SlashMenu'
import { matchCommands, type SlashCommand } from './slashCommands'
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
  /** Prompt tokens of the last request, and the window they were measured against. */
  contextUsage?: { tokens: number; window: number } | null
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
  onStop,
  contextUsage = null
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

  // Offered only while the input is a command being typed, never mid-sentence.
  const commands = useMemo(() => matchCommands(text), [text])

  const [activeIndex, setActiveIndex] = useState(0)

  // Clamped rather than reset, so narrowing the list cannot leave the highlight
  // past the end of it.
  const activeCommand: SlashCommand | undefined =
    commands.length === 0 ? undefined : commands[Math.min(activeIndex, commands.length - 1)]

  const submit = (content: string): void => {
    onSendMessage?.(content, {
      ...(activeModelId !== null ? { model: activeModelId } : {}),
      thinkingLevel
    })
    setText('')
  }

  const handleSend = (): void => {
    if (!canSend) return
    submit(text.trim())
  }

  /**
   * Keys the menu owns while it is up.
   *
   * Enter sends the highlighted command rather than completing it. Completion
   * that needs a second keypress is a step the reader did not ask for, and the
   * menu is only up because they are already looking at the command they want.
   * Tab completes without sending, for the case where they want to edit it.
   */
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (activeCommand === undefined) return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((previous) => (previous + 1) % commands.length)
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((previous) => (previous - 1 + commands.length) % commands.length)
      return true
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      setText(activeCommand.name)
      return true
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit(activeCommand.name)
      return true
    }

    return false
  }

  return (
    <div className="composer-wrapper">
      <SlashMenu
        commands={commands}
        activeIndex={commands.length === 0 ? 0 : Math.min(activeIndex, commands.length - 1)}
        onSelect={(command) => submit(command.name)}
        onActivate={setActiveIndex}
      />

      <div className="composer-capsule">
        <ComposerInput
          value={text}
          onChange={setText}
          onSubmit={handleSend}
          onKeyDown={handleInputKeyDown}
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
            <ContextRing
              tokens={contextUsage?.tokens ?? null}
              contextWindow={contextUsage?.window ?? null}
            />
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
