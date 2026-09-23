import type { FetchLike, Provider, ThinkingSupport } from '../types'
import { verifiedThinkingRequest } from '../thinking/validate'
import { createExperientialChatClient } from './client'
import { createExperientialResponsesClient } from './responses'
import { createCatalog } from './catalog'
import { EXPERIENTIAL_BASE_URL, EXPERIENTIAL_PROVIDER_ID } from './endpoints'
import { withExperientialToolIds } from './toolIds'

export interface ExperientialProviderOptions {
  apiKey: string
  baseUrl?: string
  catalogUrl?: string
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
}

// Chat handlers build a provider per request. Share the catalog across those
// instances or every context gauge and tool turn would download the catalog.
let shared: { apiKey: string; catalog: ReturnType<typeof createCatalog> } | undefined

export function createExperientialProvider(options: ExperientialProviderOptions): Provider {
  const baseUrl = options.baseUrl ?? EXPERIENTIAL_BASE_URL
  const useShared = options.baseUrl === undefined && options.catalogUrl === undefined && options.fetchImpl === undefined
    && options.ttlMs === undefined && options.now === undefined
  let catalog: ReturnType<typeof createCatalog>
  if (useShared && shared?.apiKey === options.apiKey) catalog = shared.catalog
  else {
    catalog = createCatalog(options)
    if (useShared) shared = { apiKey: options.apiKey, catalog }
  }
  const transport = {
    baseUrl, apiKey: options.apiKey,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  }
  const client = createExperientialChatClient(transport)
  const streaming = createExperientialResponsesClient(transport)
  const thinkingFor = async (id: string): Promise<ThinkingSupport> =>
    (await catalog.get(id))?.thinking ?? { reasoning: false, kind: 'unknown', levels: [] }
  return {
    id: EXPERIENTIAL_PROVIDER_ID,
    name: 'Experiential Labs',
    listModels: () => catalog.list(),
    refreshModels: () => catalog.refresh(),
    contextWindowFor: async (id) => (await catalog.get(id))?.context ?? 128_000,
    thinkingFor,
    supportsImages: async (id) => (await catalog.get(id))?.images ?? false,
    supportsToolCalls: async (id) => (await catalog.get(id))?.tools ?? false,
    chat: async (request) => client.chat(withExperientialToolIds(await verifiedThinkingRequest(request, thinkingFor))),
    streamChat: async function* (request) {
      yield* streaming.stream(withExperientialToolIds(await verifiedThinkingRequest(request, thinkingFor)))
    },
  }
}
