import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, Zap } from 'lucide-react'

import type { ModelEndpoint } from '../../../contracts/providers'
import { Dropdown } from '../Dropdown'
import { filterAuto, filterHosts } from './filter'
import { formatDiscount, formatLatency, formatPricePair, formatTps } from './format'
import { useT, type MessageKey } from '../../i18n'
import { defaultRoute, type StoredRoute } from './storage'
import './routePicker.css'

export interface RoutePickerProps {
  value: StoredRoute
  endpoints: readonly ModelEndpoint[]
  onSelect: (route: StoredRoute) => void
  disabled?: boolean
  error?: string | null
}

function labelFor(route: StoredRoute, endpoints: readonly ModelEndpoint[], fastest: string, throughput: string): string {
  if ('only' in route) {
    return endpoints.find((endpoint) => endpoint.tag === route.only)?.providerName ?? route.only
  }
  return route.sort === 'throughput' ? throughput : fastest
}

function HostStats({ endpoint }: { endpoint: ModelEndpoint }): React.JSX.Element | null {
  const t = useT()
  const tps = endpoint.throughput !== undefined ? formatTps(endpoint.throughput) : null
  const priceRaw = formatPricePair(endpoint.promptPrice, endpoint.completionPrice)
  const price = priceRaw === 'Free' ? t('route.free') : priceRaw
  const latency = endpoint.latencyMs !== undefined ? formatLatency(endpoint.latencyMs) : null
  const bits = [tps, price, latency, endpoint.quantization].filter((item): item is string => item !== null)
  if (bits.length === 0) return null
  return (
    <span className="route-host-stats">
      {bits.map((bit) => (
        <span key={bit}>{bit}</span>
      ))}
    </span>
  )
}

function autoRoutes(translate: (key: MessageKey) => string): Array<{
  route: StoredRoute
  title: string
  note: string
  haystack: string
}> {
  return [
    {
      route: { sort: 'latency' },
      title: translate('route.fastest'),
      note: translate('route.fastestNote'),
      haystack: 'Fastest Lowest time to first token',
    },
    {
      route: { sort: 'throughput' },
      title: translate('route.throughput'),
      note: translate('route.throughputNote'),
      haystack: 'Throughput Highest tokens per second',
    },
  ]
}

/**
 * Which OpenRouter host should serve this model.
 *
 * Fastest is latency sort. Throughput ranks generation speed. A named host is
 * pinned with no fallback. Each host row carries TPS, listed price, and any
 * discount OpenRouter published for it.
 */
export function RoutePicker({
  value,
  endpoints,
  onSelect,
  disabled = false,
  error = null,
}: RoutePickerProps): React.JSX.Element {
  const t = useT()
  const current = labelFor(value, endpoints, t('route.fastest'), t('route.throughput'))

  return (
    <Dropdown
      title={t('route.host')}
      menuClassName="route-picker-menu"
      disabled={disabled}
      label={
        <>
          <Zap size={13} aria-hidden="true" />
          <span className="composer-picker-label">{current}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <RouteMenu
          value={value}
          endpoints={endpoints}
          onSelect={onSelect}
          close={close}
          error={error}
        />
      )}
    </Dropdown>
  )
}

/**
 * Lives only while the menu is open, so the search box starts empty every time
 * rather than carrying the last query into the next open.
 */
function RouteMenu({
  value,
  endpoints,
  onSelect,
  close,
  error,
}: RoutePickerProps & { close: () => void }): React.JSX.Element {
  const t = useT()
  const [query, setQuery] = useState('')
  const choices = useMemo(() => autoRoutes(t), [t])

  const shownAuto = useMemo(() => filterAuto(choices, query), [choices, query])
  const shownHosts = useMemo(() => filterHosts(endpoints, query), [endpoints, query])
  const searching = query.trim() !== ''
  const empty = shownAuto.length === 0 && shownHosts.length === 0

  return (
    <>
      <div className="route-search">
        <Search size={14} aria-hidden="true" className="route-search-icon" />
        <input
          type="search"
          className="route-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault()
          }}
          placeholder={t('route.search')}
          aria-label={t('route.search')}
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </div>

      <div className="route-picker-body">
        {empty ? (
          <div className="composer-picker-note">
            {searching ? t('route.noMatch') : t('route.empty')}
          </div>
        ) : (
          <>
            {shownAuto.length > 0 ? (
              <ul className="route-picker-list">
                {shownAuto.map((choice) => {
                  const selected = JSON.stringify(choice.route) === JSON.stringify(value)
                  return (
                    <li key={choice.title}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={'route-row' + (selected ? ' active' : '')}
                        onClick={() => {
                          onSelect(choice.route)
                          close()
                        }}
                      >
                        <span className="route-row-top">
                          <span className="route-row-name">{choice.title}</span>
                          {selected ? <Check size={13} aria-hidden="true" /> : null}
                        </span>
                        <span className="route-row-note">{choice.note}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}

            {shownHosts.length > 0 ? (
              <>
                <div className="route-picker-heading">{t('route.hosts')}</div>
                <ul className="route-picker-list">
                  {shownHosts.map((endpoint) => {
                    const route: StoredRoute = { only: endpoint.tag }
                    const selected = JSON.stringify(route) === JSON.stringify(value)
                    const discountRaw = formatDiscount(endpoint.discount)
                    const discount = discountRaw === 'Free' ? t('route.free') : discountRaw
                    return (
                      <li key={endpoint.tag}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={'route-row' + (selected ? ' active' : '')}
                          onClick={() => {
                            onSelect(route)
                            close()
                          }}
                        >
                          <span className="route-row-top">
                            <span className="route-row-name">{endpoint.providerName}</span>
                            {discount !== null ? <span className="route-discount">{discount}</span> : null}
                            {selected ? <Check size={13} aria-hidden="true" /> : null}
                          </span>
                          <HostStats endpoint={endpoint} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}
          </>
        )}

        {error !== null ? <div className="composer-picker-note composer-picker-note-error">{error}</div> : null}
      </div>
    </>
  )
}

export function resolvedRoute(
  saved: StoredRoute,
  endpoints: readonly ModelEndpoint[],
  ready = false,
): StoredRoute {
  if (!('only' in saved)) return saved
  if (endpoints.some((endpoint) => endpoint.tag === saved.only)) return saved
  if (endpoints.length === 0 && !ready) return saved
  return defaultRoute()
}

export { defaultRoute }
