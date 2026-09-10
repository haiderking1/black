import React from 'react'
import { Check, ChevronDown } from 'lucide-react'

import type { ModelInfo } from '../../contracts/providers'
import { Dropdown } from './Dropdown'

export interface ModelPickerProps {
  models: readonly ModelInfo[]
  selectedModelId: string | null
  onSelect: (modelId: string) => void
  isLoading?: boolean
  error?: string | null
}

/** Trim a vendor id to something that fits the toolbar. */
function shortName(id: string): string {
  return id.length > 24 ? id.slice(0, 23) + '\u2026' : id
}

/**
 * Model chooser.
 *
 * Lists what the provider currently serves. An empty catalog explains itself
 * rather than rendering an empty menu, because the usual cause is a missing key
 * and that is actionable.
 */
export function ModelPicker({
  models,
  selectedModelId,
  onSelect,
  isLoading = false,
  error = null,
}: ModelPickerProps): React.JSX.Element {
  const label = selectedModelId ?? (models.length > 0 ? models[0]?.id ?? 'Select model' : 'Select model')

  return (
    <Dropdown
      title="Choose a model"
      disabled={isLoading}
      label={
        <>
          <span className="composer-picker-label">{shortName(label)}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <>
          {isLoading ? <div className="composer-picker-note">Loading models\u2026</div> : null}

          {!isLoading && error !== null ? (
            <div className="composer-picker-note composer-picker-note-error">{error}</div>
          ) : null}

          {!isLoading && error === null && models.length === 0 ? (
            <div className="composer-picker-note">No models available.</div>
          ) : null}

          {!isLoading && models.length > 0 ? (
            <ul className="composer-picker-list">
              {models.map((model) => {
                const selected = model.id === selectedModelId
                return (
                  <li key={model.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={'composer-picker-item ' + (selected ? 'active' : '')}
                      onClick={() => {
                        onSelect(model.id)
                        close()
                      }}
                    >
                      <span className="composer-picker-item-id">{model.id}</span>
                      {selected ? <Check size={13} aria-hidden="true" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </>
      )}
    </Dropdown>
  )
}
