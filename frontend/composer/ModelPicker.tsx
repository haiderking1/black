import React from 'react'
import { ChevronDown } from 'lucide-react'

import type { ModelInfo } from '../../contracts/providers'
import { Dropdown } from './Dropdown'
import { ModelPanel } from './ModelPanel'
import { displayName } from './modelRow'

export interface ModelPickerProps {
  models: readonly ModelInfo[]
  selectedModelId: string | null
  onSelect: (modelId: string) => void
  /** Provider serving this catalog. */
  providerId?: string
  /** Display name of the serving provider, from its descriptor. */
  providerName?: string
  providers?: readonly { id: string; name: string }[]
  onSelectProvider?: (providerId: string) => void
  isLoading?: boolean
  error?: string | null
}

/** Trim a vendor id to something that fits the toolbar. */
function shortName(label: string): string {
  return label.length > 24 ? label.slice(0, 23) + '\u2026' : label
}

/**
 * Model chooser.
 *
 * A panel rather than a list of names, because a catalog of thirty-odd entries
 * with no way to narrow it is a scroll, and each entry needs to say what it is
 * before the reader commits to it.
 *
 * An empty catalog explains itself rather than rendering an empty panel: the
 * usual cause is a missing key, and that is actionable.
 */
export function ModelPicker({
  models,
  selectedModelId,
  onSelect,
  providerId = 'opencode-go',
  providerName = 'Provider',
  providers = [],
  onSelectProvider,
  isLoading = false,
  error = null,
}: ModelPickerProps): React.JSX.Element {
  const selected = models.find((model) => model.id === selectedModelId)
  const label = selected !== undefined
    ? displayName(selected)
    : selectedModelId ?? (models[0] !== undefined ? displayName(models[0]) : 'Select model')

  return (
    <Dropdown
      title="Choose a model"
      disabled={isLoading && models.length === 0 && providers.length === 0}
      menuClassName="composer-picker-menu-wide"
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

          {models.length > 0 || providers.length > 0 ? (
            <ModelPanel
              models={models}
              selectedModelId={selectedModelId}
              providerId={providerId}
              providerName={providerName}
              providers={providers}
              {...(onSelectProvider !== undefined ? { onSelectProvider } : {})}
              onSelect={onSelect}
              close={close}
            />
          ) : null}
        </>
      )}
    </Dropdown>
  )
}
