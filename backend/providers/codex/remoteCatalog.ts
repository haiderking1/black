import { createTtlCache, type TtlCache } from '../cache'
import { describeError, messageFromBody, readErrorBody } from '../errors'
import type { FetchLike, ModelInfo, ThinkingSupport } from '../types'
import { accountIdFromAccessToken } from './oauth/jwt'
import { CODEX_MODELS } from './catalog'
import { resolveCodexModelsUrl } from './endpoints'
import { buildCodexHeaders } from './headers'

export const CODEX_CATALOG_TTL_MS = 15 * 60 * 1000
// Codex filters catalog entries against each model's minimal_client_version.
// This matches the newest model requirement in OpenAI's current Codex catalog.
export const CODEX_CLIENT_VERSION = '0.155.0'

export interface RemoteCodexModel extends ModelInfo {
  context: number
  images: boolean
  tools: boolean
  thinking: ThinkingSupport
}

export interface CodexCatalogOptions {
  baseUrl: string
  accessToken: string
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
}

export interface CodexCatalog {
  list(): Promise<ModelInfo[]>
  get(modelId: string): Promise<RemoteCodexModel | undefined>
  refresh(): Promise<ModelInfo[]>
  cache: TtlCache<RemoteCodexModel[]>
}

const FALLBACK_CONTEXT = 272_000
const UNKNOWN_THINKING: ThinkingSupport = { reasoning: false, kind: 'unknown', levels: [] }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return value as Record<string, unknown>
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function effortLevels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const levels: string[] = []
  for (const item of value) {
    const record = asRecord(item)
    const effort = stringValue(record?.['effort'])
    if (effort !== undefined && !levels.includes(effort)) levels.push(effort)
  }
  return levels
}

function parseModel(value: unknown): RemoteCodexModel | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const id = stringValue(record['slug'])
  if (id === undefined || record['supported_in_api'] === false || record['visibility'] === 'hide') return undefined

  const known = CODEX_MODELS.find((model) => model.id === id)
  const levels = effortLevels(record['supported_reasoning_levels'])
  const context = record['context_window']
  const displayName = stringValue(record['display_name'])
  const inputModalities = record['input_modalities']
  const supportsImages = Array.isArray(inputModalities) && inputModalities.includes('image')

  return {
    id,
    ownedBy: 'openai',
    created: 0,
    ...(displayName === undefined ? (known === undefined ? {} : { name: known.name }) : { name: displayName }),
    context: typeof context === 'number' && Number.isSafeInteger(context) && context > 0
      ? context
      : known?.context ?? FALLBACK_CONTEXT,
    images: supportsImages || record['supports_image_detail_original'] === true || known?.images === true,
    tools: stringValue(record['shell_type']) !== undefined || known?.tools === true,
    thinking: levels.length > 0
      ? { reasoning: true, kind: 'effort', levels }
      : known?.thinking ?? UNKNOWN_THINKING,
  }
}

function parseModels(body: unknown): RemoteCodexModel[] {
  const models = asRecord(body)?.['models']
  if (!Array.isArray(models)) throw new Error('Codex model catalog response did not contain a models list')

  const parsed: RemoteCodexModel[] = []
  const seen = new Set<string>()
  for (const entry of models) {
    const model = parseModel(entry)
    if (model === undefined || seen.has(model.id)) continue
    seen.add(model.id)
    parsed.push(model)
  }
  if (parsed.length === 0) {
    throw new Error('Codex model catalog returned no usable models for client version ' + CODEX_CLIENT_VERSION)
  }
  return parsed
}

function toList(models: readonly RemoteCodexModel[]): ModelInfo[] {
  return models.map(({ id, ownedBy, created, name }) => ({
    id,
    ownedBy,
    created,
    ...(name === undefined ? {} : { name }),
  }))
}

export function createCodexCatalog(options: CodexCatalogOptions): CodexCatalog {
  const doFetch = options.fetchImpl ?? fetch

  const load = async (): Promise<RemoteCodexModel[]> => {
    const accountId = accountIdFromAccessToken(options.accessToken)
    const url = new URL(resolveCodexModelsUrl(options.baseUrl))
    url.searchParams.set('client_version', CODEX_CLIENT_VERSION)
    const headers = buildCodexHeaders({
      accessToken: options.accessToken,
      accountId,
      accept: 'application/json',
      contentType: null,
    })

    let response: Response
    try {
      response = await doFetch(url.toString(), { method: 'GET', headers })
    } catch (error) {
      throw new Error('Codex model catalog request failed: ' + describeError(error))
    }
    if (!response.ok) {
      const body = await readErrorBody(response)
      const detail = messageFromBody(body, 'The provider returned no error details.')
      throw new Error('Codex model catalog request failed (' + response.status + '): ' + detail)
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new Error('Codex model catalog response was not valid JSON')
    }
    return parseModels(body)
  }

  const cache = createTtlCache(load, {
    ttlMs: options.ttlMs ?? CODEX_CATALOG_TTL_MS,
    ...(options.now !== undefined ? { now: options.now } : {}),
  })

  const list = async (): Promise<ModelInfo[]> => toList(await cache.get())

  return {
    list,
    get: async (modelId) => {
      const remote = cache.peek() ?? await cache.get().catch(() => [])
      const model = remote.find((entry) => entry.id === modelId)
      if (model !== undefined) return model
      const known = CODEX_MODELS.find((entry) => entry.id === modelId)
      if (known === undefined) return undefined
      return { ...known }
    },
    refresh: async () => toList(await cache.refresh()),
    cache,
  }
}
