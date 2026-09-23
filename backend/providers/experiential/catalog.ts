import { createTtlCache } from '../cache'
import { ProviderError, codeFromStatus, describeError, messageFromBody, readErrorBody } from '../errors'
import type { FetchLike, ModelInfo, ThinkingSupport } from '../types'
import { EXPERIENTIAL_BASE_URL, EXPERIENTIAL_CATALOG_URL, EXPERIENTIAL_PROVIDER_ID, isChatModel } from './endpoints'

const TTL_MS = 15 * 60 * 1000
const PAGE_SIZE = 1000
const FALLBACK_CONTEXT = 128_000
const UNKNOWN_THINKING: ThinkingSupport = { reasoning: false, kind: 'unknown', levels: [] }

export interface ExperientialModel extends ModelInfo {
  canonicalSlug: string
  context: number
  images: boolean
  tools: boolean
  thinking: ThinkingSupport
}

export interface CatalogOptions {
  apiKey: string
  baseUrl?: string
  catalogUrl?: string
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/** Only send effort levels the serving route actually publishes. */
export function parseMetadata(value: unknown): Pick<ExperientialModel, 'context' | 'images' | 'tools' | 'thinking'> {
  const row = record(value)
  const model = record(row?.model) ?? row
  const params = record(model?.supported_params)
  const providers = Array.isArray(row?.providers) ? row.providers : []
  const routable = providers.map(record).filter((provider): provider is Record<string, unknown> =>
    provider !== undefined && provider.status !== 'disabled' && provider.routable !== false)
  let efforts: Set<string> | undefined
  for (const provider of routable) {
    const caps = record(provider.capabilities)
    const levels = caps?.supported_reasoning_efforts
    const supported = new Set(Array.isArray(levels) ? levels.filter((level): level is string =>
      typeof level === 'string' && ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(level)) : [])
    // A waterfall may land on any rung. Only offer efforts every rung accepts.
    efforts = efforts === undefined ? supported : new Set([...efforts].filter(level => supported.has(level)))
  }
  // The model-wide flag can lag behind the serving route (GPT-6 Luna currently
  // reports false there while its active OpenAI route publishes effort levels).
  const reasoning = params?.reasoning === true || routable.some(provider => {
    const caps = record(provider.capabilities)
    return caps?.supports_reasoning === true || (Array.isArray(caps?.supported_reasoning_efforts) && caps.supported_reasoning_efforts.length > 0)
  })
  return {
    context: positiveInteger(model?.context_window) ?? FALLBACK_CONTEXT,
    images: Array.isArray(model?.input_modalities) && model.input_modalities.includes('image'),
    tools: params?.tools === true,
    thinking: reasoning ? {
      reasoning: true,
      kind: efforts !== undefined && efforts.size > 0 ? 'effort' : 'unknown',
      levels: [...(efforts ?? [])],
    } : { reasoning: false, kind: 'none', levels: [] },
  }
}

async function fetchJson(url: string, apiKey: string, doFetch: FetchLike): Promise<unknown> {
  let response: Response
  try {
    response = await doFetch(url, { headers: { Authorization: 'Bearer ' + apiKey } })
  } catch (error) {
    throw new ProviderError(EXPERIENTIAL_PROVIDER_ID, 'network', describeError(error))
  }
  if (!response.ok) {
    const body = await readErrorBody(response)
    throw new ProviderError(EXPERIENTIAL_PROVIDER_ID, codeFromStatus(response.status),
      messageFromBody(body, 'Model catalog request failed with status ' + response.status), response.status)
  }
  try {
    return await response.json() as unknown
  } catch {
    throw new ProviderError(EXPERIENTIAL_PROVIDER_ID, 'malformed_response', 'Model catalog was not JSON')
  }
}

function parseCallable(body: unknown): Map<string, ExperientialModel> {
  const data = record(body)?.data
  if (!Array.isArray(data)) throw new ProviderError(EXPERIENTIAL_PROVIDER_ID, 'malformed_response', 'Callable model list was missing data')
  const models = new Map<string, ExperientialModel>()
  for (const value of data) {
    const row = record(value)
    if (row === undefined) continue
    const id = row.id
    if (typeof id !== 'string' || !isChatModel(id) || models.has(id)) continue
    const created = typeof row.created === 'number' && Number.isFinite(row.created) ? row.created : 0
    const ownedBy = typeof row.owned_by === 'string' ? row.owned_by : 'experiential'
    const name = typeof row.name === 'string' && row.name !== '' ? row.name : undefined
    const canonicalSlug = typeof row.canonical_slug === 'string' && row.canonical_slug !== ''
      ? row.canonical_slug : id.replace(/:free$/, '')
    models.set(id, {
      id, canonicalSlug, created, ownedBy, ...(name === undefined ? {} : { name }),
      context: positiveInteger(row.context_window) ?? FALLBACK_CONTEXT,
      images: false, tools: false, thinking: UNKNOWN_THINKING,
    })
  }
  return models
}

export function createCatalog(options: CatalogOptions) {
  const doFetch = options.fetchImpl ?? fetch
  const base = (options.baseUrl ?? EXPERIENTIAL_BASE_URL).replace(/\/+$/, '')
  const catalogBase = (options.catalogUrl ?? EXPERIENTIAL_CATALOG_URL).replace(/\/+$/, '')
  const load = async (): Promise<Map<string, ExperientialModel>> => {
    const models = parseCallable(await fetchJson(base + '/models', options.apiKey, doFetch))
    if (models.size === 0) throw new ProviderError(EXPERIENTIAL_PROVIDER_ID, 'malformed_response', 'No chat models in callable catalog')

    // The callable list defines access. The control-plane catalog supplies the
    // context, modalities, tool support and reasoning levels absent from it.
    // A :free lane shares the canonical slug's capabilities, but remains its
    // own callable model id in the picker.
    const idsBySlug = new Map<string, string[]>()
    for (const [id, model] of models) {
      const slug = model.canonicalSlug
      idsBySlug.set(slug, [...(idsBySlug.get(slug) ?? []), id])
    }
    let offset = 0
    for (;;) {
      const url = catalogBase + '?limit=' + PAGE_SIZE + '&offset=' + offset
      const body = record(await fetchJson(url, options.apiKey, doFetch))
      const rows = body?.models
      if (!Array.isArray(rows)) throw new ProviderError(EXPERIENTIAL_PROVIDER_ID, 'malformed_response', 'Model metadata was missing models')
      for (const value of rows) {
        const row = record(value)
        const model = record(row?.model)
        if (model === undefined) continue
        const slug = model.slug
        if (typeof slug !== 'string') continue
        for (const id of idsBySlug.get(slug) ?? []) {
          const entry = models.get(id)
          if (entry === undefined) continue
          const display = typeof model.display_name === 'string' && model.display_name !== '' ? model.display_name : undefined
          const name = entry.name ?? (id.endsWith(':free') && display !== undefined ? display + ' (Free)' : display)
          models.set(id, { ...entry, ...(name === undefined ? {} : { name }), ...parseMetadata(row) })
        }
      }
      offset += rows.length
      const total = body?.total
      if (rows.length === 0 || (typeof total === 'number' && offset >= total) || rows.length < PAGE_SIZE) break
      if (offset > 100_000) throw new ProviderError(EXPERIENTIAL_PROVIDER_ID, 'malformed_response', 'Model catalog pagination did not finish')
    }
    return models
  }
  const list = (models: Map<string, ExperientialModel>): ModelInfo[] =>
    [...models.values()].map(({ id, name, created, ownedBy }) =>
      ({ id, created, ownedBy, ...(name === undefined ? {} : { name }) }))
  const cache = createTtlCache(load, {
    ttlMs: options.ttlMs ?? TTL_MS,
    ...(options.now === undefined ? {} : { now: options.now }),
  })
  return {
    list: async (): Promise<ModelInfo[]> => list(await cache.get()),
    get: async (id: string): Promise<ExperientialModel | undefined> => (await cache.get()).get(id),
    refresh: async (): Promise<ModelInfo[]> => list(await cache.refresh()),
  }
}
