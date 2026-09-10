/**
 * The model catalog.
 *
 * Read from the vendor rather than hardcoded, so a model the vendor adds is
 * available without a release here. The response is the OpenAI list shape, which
 * Zen and Go both serve.
 */

import { ProviderError, messageFromBody } from '../errors'
import type { FetchLike, ModelInfo } from '../types'
import { createTtlCache, type TtlCache } from '../cache'
import { MODELS_PATH, joinUrl } from './endpoints'

/** A catalog changes on the order of days. */
export const DEFAULT_CATALOG_TTL_MS = 15 * 60 * 1000

export interface CatalogOptions {
  providerId: string
  baseUrl: string
  /** Injectable for tests: the fetch implementation to use. */
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
}

export interface Catalog {
  list(): Promise<ModelInfo[]>
  refresh(): Promise<ModelInfo[]>
  invalidate(): void
  /** Exposed for tests that need to observe caching. */
  cache: TtlCache<ModelInfo[]>
}

/** Parse an OpenAI-shaped model list, discarding entries without a usable id. */
function parseModelList(body: unknown): ModelInfo[] {
  if (typeof body !== 'object' || body === null) return []
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return []

  const models: ModelInfo[] = []
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) continue
    const candidate = entry as { id?: unknown; owned_by?: unknown; created?: unknown }
    if (typeof candidate.id !== 'string' || candidate.id === '') continue
    models.push({
      id: candidate.id,
      ownedBy: typeof candidate.owned_by === 'string' ? candidate.owned_by : '',
      created: typeof candidate.created === 'number' && Number.isFinite(candidate.created) ? candidate.created : 0,
    })
  }
  return models
}

export function createCatalog(options: CatalogOptions): Catalog {
  const doFetch = options.fetchImpl ?? fetch

  const load = async (): Promise<ModelInfo[]> => {
    const url = joinUrl(options.baseUrl, MODELS_PATH)
    let response: Response
    try {
      response = await doFetch(url)
    } catch (error) {
      throw new ProviderError(
        options.providerId,
        'network',
        error instanceof Error ? error.message : String(error),
      )
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined
      }
      throw new ProviderError(
        options.providerId,
        response.status === 429 ? 'rate_limit' : 'server',
        messageFromBody(body, 'Model catalog request failed with status ' + response.status),
        response.status,
      )
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ProviderError(options.providerId, 'malformed_response', 'Model catalog was not JSON')
    }

    const models = parseModelList(body)
    if (models.length === 0) {
      throw new ProviderError(options.providerId, 'malformed_response', 'Model catalog was empty')
    }
    return models
  }

  const cache = createTtlCache(load, {
    ttlMs: options.ttlMs ?? DEFAULT_CATALOG_TTL_MS,
    ...(options.now !== undefined ? { now: options.now } : {}),
  })

  return {
    list: () => cache.get(),
    refresh: () => cache.refresh(),
    invalidate: () => cache.invalidate(),
    cache,
  }
}
