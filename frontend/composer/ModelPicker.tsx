import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { ModelInfo } from '../../contracts/providers'
import { Dropdown } from './Dropdown'
import { ModelPanel } from './ModelPanel'
import { displayName } from './modelRow'
import { ProviderLogo } from '../providers'
import { useT } from '../i18n'
import { useModels } from './useModels'

export interface ModelPickerProps {
  models: readonly ModelInfo[]
  selectedModelId: string | null
  onSelect: (modelId: string, providerId: string) => void
  /** Provider serving this catalog. */
  providerId?: string
  /** Display name of the serving provider, from its descriptor. */
  providerName?: string
  providers?: readonly { id: string; name: string }[]
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
  providerName,
  providers = [],
  isLoading = false,
  error = null,
}: ModelPickerProps): React.JSX.Element {
  const t = useT()
  const servingName = providerName ?? t('model.provider')
  const selected = models.find((model) => model.id === selectedModelId)
  const label = selected !== undefined
    ? displayName(selected)
    : selectedModelId ?? (models[0] !== undefined ? displayName(models[0]) : t('model.select'))

  return (
    <Dropdown
      title={t('model.choose')}
      disabled={isLoading && models.length === 0 && providers.length === 0}
      menuClassName="composer-picker-menu-wide"
      label={
        <>
          <ProviderLogo
            providerId={providerId}
            size={14}
            {...(providerName !== undefined ? { fallbackLabel: providerName } : {})}
          />
          <span className="composer-picker-label">{shortName(label)}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <ModelCatalogMenu
          models={models}
          selectedModelId={selectedModelId}
          providerId={providerId}
          providerName={servingName}
          providers={providers}
          isLoading={isLoading}
          error={error}
          onSelect={onSelect}
          close={close}
        />
      )}
    </Dropdown>
  )
}

/** Mounted only while open; browsing never changes the committed selection. */
function ModelCatalogMenu({
  models, selectedModelId, providerId = 'opencode-go', providerName,
  providers = [], isLoading = false, error = null, onSelect, close,
}: ModelPickerProps & { close: () => void }): React.JSX.Element {
  const t = useT()
  const [browsedProviderId, setBrowsedProviderId] = useState(providerId)
  const isSelectedProvider = browsedProviderId === providerId
  const catalog = useModels(isSelectedProvider ? '' : browsedProviderId)
  const visibleModels = isSelectedProvider ? models : catalog.models
  const loading = isSelectedProvider ? isLoading : catalog.isLoading
  const catalogError = isSelectedProvider ? error : catalog.error
  const browsedProviderName = isSelectedProvider ? providerName ?? t('model.provider')
    : providers.find(provider => provider.id === browsedProviderId)?.name ?? browsedProviderId

  return (
    <>
      {loading ? <div className="composer-picker-note">{t('model.loading')}</div> : null}
      {!loading && catalogError !== null ? (
        <div className="composer-picker-note composer-picker-note-error">{catalogError}</div>
      ) : null}
      {!loading && catalogError === null && visibleModels.length === 0 ? (
        <div className="composer-picker-note">{t('model.empty')}</div>
      ) : null}
      <ModelPanel
        models={visibleModels}
        selectedModelId={isSelectedProvider ? selectedModelId : null}
        providerId={browsedProviderId}
        providerName={browsedProviderName}
        providers={providers}
        onBrowseProvider={setBrowsedProviderId}
        onSelect={modelId => onSelect(modelId, browsedProviderId)}
        close={close}
      />
    </>
  )
}
