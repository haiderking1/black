import React from 'react'
import { Brain, Check, ChevronDown } from 'lucide-react'

import { Dropdown } from './Dropdown'
import type { ThinkingChoice } from './thinkingOptions'

export interface ThinkingPickerProps {
  value: string
  choices: ThinkingChoice[]
  onSelect: (value: string) => void
  /** True when the model exposes nothing this client can set. */
  disabled?: boolean
  /** Why the list is limited, shown when it is. */
  note?: string | null
}

/**
 * Reasoning effort.
 *
 * Sits beside the model picker because the two are chosen together, and the
 * options come from the selected model: a model that takes only 'max' must not
 * be offered 'medium'.
 */
export function ThinkingPicker({
  value,
  choices,
  onSelect,
  disabled = false,
  note = null
}: ThinkingPickerProps): React.JSX.Element {
  const current = choices.find((choice) => choice.value === value)
  const label = current?.label ?? value

  return (
    <Dropdown
      title="Thinking level"
      disabled={disabled}
      label={
        <>
          <Brain size={13} aria-hidden="true" />
          <span className="composer-picker-label">{label}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <>
          <ul className="composer-picker-list">
            {choices.map((choice) => {
              const selected = choice.value === value
              return (
                <li key={choice.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={'composer-picker-item ' + (selected ? 'active' : '')}
                    onClick={() => {
                      onSelect(choice.value)
                      close()
                    }}
                  >
                    <span className="composer-picker-item-label">{choice.label}</span>
                    {selected ? <Check size={13} aria-hidden="true" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>

          {note !== null ? <div className="composer-picker-note">{note}</div> : null}
        </>
      )}
    </Dropdown>
  )
}
