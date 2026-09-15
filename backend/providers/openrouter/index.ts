/**
 * OpenRouter.
 *
 * Catalog, context, thinking, and host lists all come from OpenRouter itself.
 * Effort is sent as `reasoning.effort`. Hosts are selected with `provider`.
 */

import type { ChatRoute, FetchLike, Provider } from '../types'
import { verifiedThinkingRequest } from '../thinking/validate'
import { createCatalog, FALLBACK_CONTEXT_WINDOW, type Catalog } from './catalog'
import { createChatClient } from './client'
import { createStreamingClient } from './stream'
import { createHostLists, type HostLists } from './hosts'
import { OPENROUTER_BASE_URL } from './endpoints'
import { pinnedContext } from './routing'

export interface OpenRouterProviderOptions {
  baseUrl?: string
  apiKey: string
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
}

export interface OpenRouterProvider extends Provider {
  catalog: Catalog
  hosts: HostLists
}

export function createOpenRouterProvider(options: OpenRouterProviderOptions): OpenRouterProvider {
  const baseUrl = options.baseUrl ?? OPENROUTER_BASE_URL
  const shared = {
    providerId: 'openrouter' as const,
    baseUrl,
    apiKey: options.apiKey,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  }

  const catalog = createCatalog({
    ...shared,
    ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}),
  })
  const hosts = createHostLists(shared)
  const client = createChatClient(shared)
  const streaming = createStreamingClient({
    baseUrl,
    apiKey: options.apiKey,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  })

  const thinkingFor = async (modelId: string) =>
    (await catalog.get(modelId))?.thinking ?? { reasoning: false, kind: 'unknown' as const, levels: [] }

  const contextWindowFor = async (modelId: string, route?: ChatRoute): Promise<number> => {
    const only = route?.only?.trim()
    if (only !== undefined && only !== '') {
      try {
        const pinned = pinnedContext(await hosts.list(modelId), only)
        if (pinned !== undefined) return pinned
      } catch {
        // A host list outage must not fail the turn. The catalog window is next.
      }
    }
    return (await catalog.get(modelId))?.context ?? FALLBACK_CONTEXT_WINDOW
  }

  return {
    id: 'openrouter',
    name: 'OpenRouter',
    catalog,
    hosts,
    listModels: () => catalog.list(),
    refreshModels: () => catalog.refresh(),
    contextWindowFor,
    thinkingFor,
    supportsImages: async (modelId) => (await catalog.get(modelId))?.images ?? false,
    supportsToolCalls: async (modelId) => (await catalog.get(modelId))?.tools ?? true,
    listEndpoints: (modelId) => hosts.list(modelId),
    chat: async (request) => client.chat(await verifiedThinkingRequest(request, thinkingFor)),
    streamChat: async function* (request) {
      yield* streaming.stream(await verifiedThinkingRequest(request, thinkingFor))
    },
  }
}
