import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, Zap } from 'lucide-react'

import type { ModelEndpoint } from '../../../contracts/providers'
import { Dropdown } from '../Dropdown'
import { filterAuto, filterHosts } from './filter'
import { formatDiscount, formatLatency, formatPricePair, formatTps } from './format'
import { defaultRoute, type StoredRoute } from './storage'
import './routePicker.css'

export interface RoutePickerProps {
  value: StoredRoute
  endpoints: readonly ModelEndpoint[]
  onSelect: (route: StoredRoute) => void
  disabled?: boolean
  error?: string | null
}

function labelFor(route: StoredRoute, endpoints: readonly ModelEndpoint[]): string {
  if ('only' in route) {
    return endpoints.find((endpoint) => endpoint.tag === route.only)?.providerName ?? route.only
  }
  return route.sort === 'throughput' ? 'Throughput' : 'Fastest'
}

function HostStats({ endpoint }: { endpoint: ModelEndpoint }): React.JSX.Element | null {
  const tps = endpoint.throughput !== undefined ? formatTps(endpoint.throughput) : null
  const price = formatPricePair(endpoint.promptPrice, endpoint.completionPrice)
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

const AUTO_ROUTES: Array<{ route: StoredRoute; title: string; note: string }> = [
  { route: { sort: 'latency' }, title: 'Fastest', note: 'Lowest time to first token' },
  { route: { sort: 'throughput' }, title: 'Throughput', note: 'Highest tokens per second' },
]

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
  const current = labelFor(value, endpoints)

  return (
    <Dropdown
      title="Provider host"
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
  const [query, setQuery] = useState('')

  const shownAuto = useMemo(() => filterAuto(AUTO_ROUTES, query), [query])
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
          placeholder="Search hosts..."
          aria-label="Search hosts"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </div>

      <div className="route-picker-body">
        {empty ? (
          <div className="composer-picker-note">
            {searching ? 'No host matches that.' : 'No hosts listed.'}
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
                <div className="route-picker-heading">Hosts</div>
                <ul className="route-picker-list">
                  {shownHosts.map((endpoint) => {
                    const route: StoredRoute = { only: endpoint.tag }
                    const selected = JSON.stringify(route) === JSON.stringify(value)
                    const discount = formatDiscount(endpoint.discount)
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
