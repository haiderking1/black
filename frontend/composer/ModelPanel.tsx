import React, { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Search, Star } from 'lucide-react'

import type { ModelInfo } from '../../contracts/providers'
import { ProviderLogo } from '../providers'
import { filterModels, groupModels, shortcutLabel, SHORTCUT_COUNT, displayName } from './modelRow'
import { toggleFavourite } from './favourites'
import { useFavourites } from './useFavourites'
import { useT } from '../i18n'

export interface ModelPanelProps {
  models: readonly ModelInfo[]
  selectedModelId: string | null
  /** Provider serving this catalog, so rows carry its mark rather than a guess. */
  providerId: string
  /** Display name of that provider, from its descriptor. */
  providerName: string
  /** Enabled, authenticated providers shown on the rail. */
  providers?: readonly { id: string; name: string }[]
  onBrowseProvider?: (providerId: string) => void
  onSelect: (modelId: string) => void
  close: () => void
}

/**
 * The picker panel.
 *
 * Mounted only while the menu is open, which is what makes the search reset on
 * each open and the shortcuts bind only when there is something to bind them to.
 */
export function ModelPanel({
  models,
  selectedModelId,
  providerId,
  providerName,
  providers = [],
  onBrowseProvider: onBrowseProvider,
  onSelect,
  close,
}: ModelPanelProps): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  const [unlistedOpen, setUnlistedOpen] = useState(false)
  const { favourites, toggle } = useFavourites()

  const searching = query.trim() !== ''

  const visible = useMemo(() => {
    const matched = filterModels(models, query)
    return favouritesOnly ? matched.filter((model) => favourites.includes(model.id)) : matched
  }, [models, query, favouritesOnly, favourites])

  const groups = useMemo(() => groupModels(visible), [visible])

  // A search reaches both halves, so a folded group can never hide a match.
  const rows = searching
    ? visible
    : unlistedOpen
      ? [...groups.primary, ...groups.unlisted]
      : groups.primary

  const choose = (modelId: string): void => {
    onSelect(modelId)
    close()
  }

  // Bound only while the panel is up, and only against the rows on screen, so
  // the number on a row is always the model that key selects.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return

      const index = Number.parseInt(event.key, 10) - 1
      if (!Number.isInteger(index) || index < 0 || index >= SHORTCUT_COUNT) return

      const model = rows[index]
      if (model === undefined) return

      event.preventDefault()
      choose(model.id)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <div className="model-panel">
      <div className="model-rail">
        <button
          type="button"
          className={'model-rail-item' + (favouritesOnly ? ' active' : '')}
          onClick={() => setFavouritesOnly((prev) => !prev)}
          aria-pressed={favouritesOnly}
          title={favouritesOnly ? t('model.showAll') : t('model.showFavourites')}
        >
          <Star size={16} aria-hidden="true" fill={favouritesOnly ? 'currentColor' : 'none'} />
        </button>
        <span className="model-rail-divider" aria-hidden="true" />
        {(providers.length > 0 ? providers : [{ id: providerId, name: providerName }]).map((provider) => (
          <button
            key={provider.id}
            type="button"
            className={'model-rail-item' + (provider.id === providerId ? ' active' : '')}
            title={provider.name}
            aria-pressed={provider.id === providerId}
            onClick={() => onBrowseProvider?.(provider.id)}
          >
            <span className="model-rail-mark">
              <ProviderLogo providerId={provider.id} size={20} fallbackLabel={provider.name} />
            </span>
          </button>
        ))}
      </div>

      <div className="model-main">
        <div className="model-search">
          <Search size={14} aria-hidden="true" className="model-search-icon" />
          <input
            className="model-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('model.search')}
            aria-label={t('model.search')}
            autoFocus
          />
        </div>

        <div className="model-scroll">
          {rows.length === 0 ? (
            <div className="composer-picker-note">
              {favouritesOnly ? t('model.noFavourites') : t('model.noMatch')}
            </div>
          ) : (
            <ul className="model-list">
              {rows.map((model, index) => {
                const selected = model.id === selectedModelId
                const favourited = favourites.includes(model.id)
                const shortcut = shortcutLabel(index)

                return (
                  <li key={model.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={'model-row' + (selected ? ' active' : '')}
                      onClick={() => choose(model.id)}
                    >
                      <span className="model-text">
                        <span className="model-name">{displayName(model)}</span>
                        <span className="model-provider">
                          <span className="model-provider-mark" aria-hidden="true">
                            <ProviderLogo
                              providerId={providerId}
                              size={13}
                              fallbackLabel={providerName}
                            />
                          </span>
                          {model.name !== undefined && model.name.trim() !== '' ? model.id : providerName}
                        </span>
                      </span>

                      {shortcut === null ? null : <kbd className="model-shortcut">{shortcut}</kbd>}

                      {selected ? (
                        <Check size={14} aria-hidden="true" className="model-check" />
                      ) : null}

                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={favourited ? t('model.removeFavourite') : t('model.addFavourite')}
                        className={'model-star' + (favourited ? ' on' : '')}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggle(model.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          event.stopPropagation()
                          toggle(model.id)
                        }}
                      >
                        <Star
                          size={14}
                          aria-hidden="true"
                          fill={favourited ? 'currentColor' : 'none'}
                        />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {!searching && !favouritesOnly && groups.unlisted.length > 0 ? (
            <button
              type="button"
              className="model-group"
              onClick={() => setUnlistedOpen((prev) => !prev)}
              aria-expanded={unlistedOpen}
            >
              <span className="model-text">
                <span className="model-name">
                  {unlistedOpen ? t('model.hideUnlisted') : t('model.unlisted')}
                </span>
                <span className="model-group-note">
                  {groups.unlisted.length === 1
                    ? t('model.count.one')
                    : t('model.count.many', { n: groups.unlisted.length })}
                </span>
              </span>
              <ChevronRight
                size={15}
                aria-hidden="true"
                className={'model-group-chevron' + (unlistedOpen ? ' open' : '')}
              />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
