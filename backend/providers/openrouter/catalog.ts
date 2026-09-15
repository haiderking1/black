/**
 * OpenRouter model catalog.
 *
 * The vendor list already carries names, context windows, modalities, and
 * reasoning levels. Those fields are the source of truth here. models.dev is
 * not consulted: its ids do not match OpenRouter slugs.
 */

import { ProviderError, messageFromBody } from '../errors'
import { createTtlCache, type TtlCache } from '../cache'
import type { FetchLike, ModelInfo, ThinkingSupport } from '../types'
import { authorOf, readCapabilities } from './capabilities'
import { MODELS_PATH, joinUrl } from './endpoints'

export const DEFAULT_CATALOG_TTL_MS = 15 * 60 * 1000

export interface OpenRouterModel extends ModelInfo {
  context: number
  thinking: ThinkingSupport
  images: boolean
  tools: boolean
}

export interface CatalogOptions {
  providerId: string
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
}

export interface Catalog {
  list(): Promise<ModelInfo[]>
  get(modelId: string): Promise<OpenRouterModel | undefined>
  all(): Promise<Map<string, OpenRouterModel>>
  refresh(): Promise<ModelInfo[]>
  invalidate(): void
  cache: TtlCache<Map<string, OpenRouterModel>>
}

function asModel(entry: unknown): OpenRouterModel | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined
  const record = entry as Record<string, unknown>
  if (typeof record['id'] !== 'string' || record['id'] === '') return undefined

  const id = record['id']
  const capabilities = readCapabilities(record)
  const ownedBy = typeof record['owned_by'] === 'string' && record['owned_by'] !== ''
    ? record['owned_by']
    : authorOf(id)
  const created = typeof record['created'] === 'number' && Number.isFinite(record['created']) ? record['created'] : 0
  const name = typeof record['name'] === 'string' && record['name'] !== '' ? record['name'] : undefined

  return {
    id,
    ownedBy,
    created,
    ...(name === undefined ? {} : { name }),
    ...capabilities,
  }
}

function parseModelList(body: unknown): Map<string, OpenRouterModel> {
  if (typeof body !== 'object' || body === null) return new Map()
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return new Map()

  const models = new Map<string, OpenRouterModel>()
  for (const entry of data) {
    const model = asModel(entry)
    if (model === undefined || models.has(model.id)) continue
    models.set(model.id, model)
  }
  return models
}

function asList(models: Map<string, OpenRouterModel>): ModelInfo[] {
  return [...models.values()].map((model) => ({
    id: model.id,
    ownedBy: model.ownedBy,
    created: model.created,
    ...(model.name === undefined ? {} : { name: model.name }),
  }))
}

export function createCatalog(options: CatalogOptions): Catalog {
  const doFetch = options.fetchImpl ?? fetch

  const load = async (): Promise<Map<string, OpenRouterModel>> => {
    const url = joinUrl(options.baseUrl, MODELS_PATH)
    let response: Response
    try {
      response = await doFetch(url, {
        headers: { Authorization: 'Bearer ' + options.apiKey },
      })
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
        response.status === 429 ? 'rate_limit' : response.status === 401 || response.status === 403 ? 'auth' : 'server',
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
    if (models.size === 0) {
      throw new ProviderError(options.providerId, 'malformed_response', 'Model catalog was empty')
    }
    return models
  }

  const cache = createTtlCache(load, {
    ttlMs: options.ttlMs ?? DEFAULT_CATALOG_TTL_MS,
    ...(options.now !== undefined ? { now: options.now } : {}),
  })

  const lookup = async (modelId: string): Promise<OpenRouterModel | undefined> => {
    try {
      return (await cache.get()).get(modelId)
    } catch {
      return undefined
    }
  }

  return {
    list: async () => asList(await cache.get()),
    get: lookup,
    all: () => cache.get(),
    refresh: async () => asList(await cache.refresh()),
    invalidate: () => cache.invalidate(),
    cache,
  }
}

export { FALLBACK_CONTEXT_WINDOW } from './capabilities'
