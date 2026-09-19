/**
 * ClinePass catalog.
 *
 * `/models` is Cline's full router. The picker is the live `clinePass` feed
 * plus `free` promos, hydrated from matching router rows for names and
 * capabilities. A feed slug the router has not listed yet is filled from
 * models.dev's ClinePass row instead of a 128k stub. Pay-as-you-go
 * `recommended` stays out.
 */

import { ProviderError, messageFromBody } from '../errors'
import { createTtlCache, type TtlCache } from '../cache'
import type { FetchLike, ModelInfo, ThinkingSupport } from '../types'
import { authorOf, CLINE_REASONING_EFFORTS, FALLBACK_CONTEXT_WINDOW, readCapabilities } from './capabilities'
import {
  defaultClineLimitsSource,
  lookupPassLimits,
  type LimitsSource,
  type ModelLimits,
} from './limits'
import { MODELS_PATH, RECOMMENDED_MODELS_PATH, joinUrl } from './endpoints'
import { clineAuthHeaders } from './headers'
import {
  CLINE_CATALOG_CACHE_VERSION,
  defaultClineCatalogStore,
  type CatalogStore,
  type StoredClineCatalog,
} from './catalogStore'
import { isClinePassId } from './pass'
import {
  feedFingerprint,
  parseClineFreeFeed,
  parseClinePassFeed,
  type ClinePassFeedEntry,
} from './recommended'

export const DEFAULT_CATALOG_TTL_MS = 15 * 60 * 1000

export interface ClineModel extends ModelInfo {
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
  /** Injected in tests. Live Cline uses the process store. */
  store?: CatalogStore
  /** Injected in tests. Live Cline reads models.dev for feed rows the router omitted. */
  limits?: LimitsSource
}

export interface Catalog {
  list(): Promise<ModelInfo[]>
  get(modelId: string): Promise<ClineModel | undefined>
  all(): Promise<Map<string, ClineModel>>
  refresh(): Promise<ModelInfo[]>
  invalidate(): void
  cache: TtlCache<Map<string, ClineModel>>
}

function asModel(entry: unknown): ClineModel | undefined {
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

function parseModelList(body: unknown): Map<string, ClineModel> {
  if (typeof body !== 'object' || body === null) return new Map()
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return new Map()

  const models = new Map<string, ClineModel>()
  for (const entry of data) {
    const model = asModel(entry)
    if (model === undefined || models.has(model.id)) continue
    models.set(model.id, model)
  }
  return models
}

function slugOf(modelId: string): string {
  const slash = modelId.lastIndexOf('/')
  return slash >= 0 ? modelId.slice(slash + 1) : modelId
}

function listedThinking(thinking: ClineModel['thinking']): ClineModel['thinking'] {
  if (thinking.kind === 'unknown') return { ...thinking, kind: 'none' }
  return thinking
}

function hydrateFromRouter(catalog: Map<string, ClineModel>, id: string): ClineModel | undefined {
  const exact = catalog.get(id)
  if (exact !== undefined) return { ...exact, id, ownedBy: authorOf(id), thinking: listedThinking(exact.thinking) }

  const want = slugOf(id)
  let fallback: ClineModel | undefined
  for (const model of catalog.values()) {
    const rawSlug = slugOf(model.id)
    if (rawSlug === want) {
      return { ...model, id, ownedBy: authorOf(id), thinking: listedThinking(model.thinking) }
    }
    const stripped = rawSlug.replace(/:(?:free|batch)$/i, '')
    if (fallback === undefined && stripped === want.replace(/:(?:free|batch)$/i, '')) {
      fallback = model
    }
  }
  if (fallback === undefined) return undefined
  return { ...fallback, id, ownedBy: authorOf(id), thinking: listedThinking(fallback.thinking) }
}

function displayName(entry: ClinePassFeedEntry, hydrated?: ClineModel): string | undefined {
  const candidates = [hydrated?.name, entry.name]
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate.trim() !== '' && candidate !== entry.id && candidate !== hydrated?.id) {
      return candidate
    }
  }
  return entry.name !== entry.id ? entry.name : hydrated?.name
}

function withFreeLabel(name: string): string {
  return /\(\s*free\s*\)\s*$/i.test(name) ? name : name + ' (free)'
}

function stubPassModel(entry: ClinePassFeedEntry, free: boolean): ClineModel {
  const rawName = displayName(entry)
  const name = rawName === undefined ? undefined : free ? withFreeLabel(rawName) : rawName
  return {
    id: entry.id,
    ownedBy: authorOf(entry.id),
    created: 0,
    ...(name === undefined ? {} : { name }),
    context: FALLBACK_CONTEXT_WINDOW,
    thinking: { reasoning: false, kind: 'none', levels: [] },
    images: false,
    tools: false,
  }
}

function thinkingFromLimits(thinking: ClineModel['thinking']): ClineModel['thinking'] {
  const listed = listedThinking(thinking)
  if (listed.reasoning && listed.kind === 'none') {
    return { reasoning: true, kind: 'effort', levels: [...CLINE_REASONING_EFFORTS] }
  }
  return listed
}

function modelFromLimits(entry: ClinePassFeedEntry, limits: ModelLimits, free: boolean): ClineModel {
  const rawName = displayName(entry)
  const name = rawName === undefined ? undefined : free ? withFreeLabel(rawName) : rawName
  return {
    id: entry.id,
    ownedBy: authorOf(entry.id),
    created: 0,
    ...(name === undefined ? {} : { name }),
    context: limits.context,
    thinking: thinkingFromLimits(limits.thinking),
    images: limits.images,
    tools: limits.tools,
  }
}

function namedEntry(entry: ClinePassFeedEntry, hydrated: ClineModel, free: boolean): ClineModel {
  const rawName = displayName(entry, hydrated)
  const name = rawName === undefined ? undefined : free ? withFreeLabel(rawName) : rawName
  return {
    ...hydrated,
    id: entry.id,
    ownedBy: authorOf(entry.id),
    ...(name === undefined ? {} : { name }),
  }
}

async function pickerModels(
  catalog: Map<string, ClineModel>,
  passFeed: ClinePassFeedEntry[],
  freeFeed: ClinePassFeedEntry[],
  limitsSource: LimitsSource | undefined,
): Promise<Map<string, ClineModel>> {
  const models = new Map<string, ClineModel>()
  const stubs: Array<{ entry: ClinePassFeedEntry; free: boolean }> = []
  const remember = (entry: ClinePassFeedEntry, free: boolean): void => {
    const hydrated = hydrateFromRouter(catalog, entry.id)
    if (hydrated === undefined) {
      models.set(entry.id, stubPassModel(entry, free))
      stubs.push({ entry, free })
      return
    }
    models.set(entry.id, namedEntry(entry, hydrated, free))
  }
  for (const entry of passFeed) remember(entry, false)
  for (const model of catalog.values()) {
    if (!isClinePassId(model.id) || models.has(model.id)) continue
    models.set(model.id, { ...model, thinking: listedThinking(model.thinking) })
  }
  for (const entry of freeFeed) {
    if (models.has(entry.id)) continue
    remember(entry, true)
  }
  if (stubs.length === 0 || limitsSource === undefined) return models

  let published: Map<string, ModelLimits>
  try {
    published = await limitsSource.all()
  } catch {
    return models
  }
  for (const { entry, free } of stubs) {
    const hit = lookupPassLimits(published, entry.id)
    if (hit === undefined) continue
    models.set(entry.id, modelFromLimits(entry, hit, free))
  }
  return models
}

const THINKING_KINDS = new Set<ClineModel['thinking']['kind']>(['effort', 'toggle', 'none', 'unknown'])

function asCachedModel(entry: unknown): ClineModel | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined
  const record = entry as Record<string, unknown>
  if (typeof record['id'] !== 'string' || record['id'] === '') return undefined
  if (typeof record['ownedBy'] !== 'string' || record['ownedBy'] === '') return undefined
  if (typeof record['created'] !== 'number' || !Number.isFinite(record['created'])) return undefined
  if (typeof record['context'] !== 'number' || !Number.isFinite(record['context']) || record['context'] <= 0) {
    return undefined
  }
  if (typeof record['images'] !== 'boolean' || typeof record['tools'] !== 'boolean') return undefined
  const thinking = record['thinking']
  if (typeof thinking !== 'object' || thinking === null) return undefined
  const support = thinking as Record<string, unknown>
  if (typeof support['reasoning'] !== 'boolean') return undefined
  if (typeof support['kind'] !== 'string' || !THINKING_KINDS.has(support['kind'] as ClineModel['thinking']['kind'])) {
    return undefined
  }
  if (!Array.isArray(support['levels']) || support['levels'].some((level) => typeof level !== 'string')) {
    return undefined
  }
  const name = typeof record['name'] === 'string' && record['name'] !== '' ? record['name'] : undefined
  return {
    id: record['id'],
    ownedBy: record['ownedBy'],
    created: record['created'],
    ...(name === undefined ? {} : { name }),
    context: record['context'],
    thinking: {
      reasoning: support['reasoning'],
      kind: support['kind'] as ClineModel['thinking']['kind'],
      levels: support['levels'] as string[],
    },
    images: record['images'],
    tools: record['tools'],
  }
}

function modelsFromStore(stored: StoredClineCatalog | undefined): Map<string, ClineModel> | undefined {
  if (stored === undefined || !Array.isArray(stored.models)) return undefined
  const models = new Map<string, ClineModel>()
  for (const entry of stored.models) {
    const model = asCachedModel(entry)
    if (model === undefined || models.has(model.id)) return undefined
    models.set(model.id, model)
  }
  return models.size === 0 ? undefined : models
}

function snapshotOf(
  models: Map<string, ClineModel>,
  fingerprint: string,
  loadedAt: number,
): StoredClineCatalog {
  return {
    version: CLINE_CATALOG_CACHE_VERSION,
    fingerprint,
    loadedAt,
    models: [...models.values()],
  }
}

function asList(models: Map<string, ClineModel>): ModelInfo[] {
  return [...models.values()].map((model) => ({
    id: model.id,
    ownedBy: model.ownedBy,
    created: model.created,
    ...(model.name === undefined ? {} : { name: model.name }),
  }))
}

async function fetchJson(
  doFetch: FetchLike,
  url: string,
  apiKey: string,
  providerId: string,
): Promise<unknown> {
  let response: Response
  try {
    response = await doFetch(url, {
      headers: clineAuthHeaders(apiKey),
    })
  } catch (error) {
    throw new ProviderError(
      providerId,
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
      providerId,
      response.status === 429 ? 'rate_limit' : response.status === 401 || response.status === 403 ? 'auth' : 'server',
      messageFromBody(body, 'Model catalog request failed with status ' + response.status),
      response.status,
    )
  }

  try {
    return await response.json()
  } catch {
    throw new ProviderError(providerId, 'malformed_response', 'Model catalog was not JSON')
  }
}

export function createCatalog(options: CatalogOptions): Catalog {
  const doFetch = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? DEFAULT_CATALOG_TTL_MS
  const store = options.store ?? (options.fetchImpl === undefined ? defaultClineCatalogStore() : undefined)
  const limits = options.limits ?? (options.fetchImpl === undefined ? defaultClineLimitsSource() : undefined)
  let forceReload = false

  const remember = (models: Map<string, ClineModel>, fingerprint: string): Map<string, ClineModel> => {
    store?.write(snapshotOf(models, fingerprint, now()))
    return models
  }

  const load = async (): Promise<Map<string, ClineModel>> => {
    const forced = forceReload
    forceReload = false
    const stored = store?.read()
    const cached = modelsFromStore(stored)
    if (!forced && cached !== undefined && stored !== undefined && now() - stored.loadedAt < ttlMs) {
      return cached
    }

    const catalogUrl = joinUrl(options.baseUrl, MODELS_PATH)
    const feedUrl = joinUrl(options.baseUrl, RECOMMENDED_MODELS_PATH)

    let passFeed: ClinePassFeedEntry[] = []
    let freeFeed: ClinePassFeedEntry[] = []
    let feedOk = false
    try {
      const feedBody = await fetchJson(doFetch, feedUrl, options.apiKey, options.providerId)
      passFeed = parseClinePassFeed(feedBody)
      freeFeed = parseClineFreeFeed(feedBody)
      feedOk = true
    } catch {
      // The router list still has ClinePass slugs. A dead feed must not hide them.
    }

    const fingerprint = feedFingerprint(passFeed, freeFeed)
    if (feedOk && cached !== undefined && stored?.fingerprint === fingerprint) {
      return remember(cached, fingerprint)
    }
    if (!feedOk && cached !== undefined) {
      return cached
    }

    const catalogBody = await fetchJson(doFetch, catalogUrl, options.apiKey, options.providerId)
    const catalog = parseModelList(catalogBody)
    const models = await pickerModels(catalog, passFeed, freeFeed, limits)
    if (models.size === 0) {
      throw new ProviderError(options.providerId, 'malformed_response', 'ClinePass catalog was empty')
    }
    return remember(models, fingerprint)
  }

  const cache = createTtlCache(load, {
    ttlMs: store === undefined ? ttlMs : 0,
    ...(options.now !== undefined ? { now: options.now } : {}),
  })

  const lookup = async (modelId: string): Promise<ClineModel | undefined> => {
    return (await cache.get()).get(modelId)
  }

  return {
    list: async () => asList(await cache.get()),
    get: lookup,
    all: () => cache.get(),
    refresh: async () => {
      forceReload = true
      return asList(await cache.refresh())
    },
    invalidate: () => {
      cache.invalidate()
      store?.clear()
    },
    cache,
  }
}

export { FALLBACK_CONTEXT_WINDOW } from './capabilities'
