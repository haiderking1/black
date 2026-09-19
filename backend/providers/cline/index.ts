/**
 * ClinePass, via a Cline subscription.
 *
 * Catalog is the live ClinePass list after browser sign-in, not Cline's
 * pay-as-you-go router. Chat goes through api.cline.bot.
 */

import type { FetchLike, Provider } from '../types'
import { verifiedThinkingRequest } from '../thinking/validate'
import { createCatalog, FALLBACK_CONTEXT_WINDOW, type Catalog } from './catalog'
import { createChatClient } from './client'
import { createStreamingClient } from './stream'
import { CLINE_CHAT_BASE_URL } from './endpoints'
import { PROVIDER_ID } from './oauth/constants'

export interface ClineProviderOptions {
  baseUrl?: string
  apiKey: string
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
}

export interface ClineProvider extends Provider {
  catalog: Catalog
}

export function createClineProvider(options: ClineProviderOptions): ClineProvider {
  const baseUrl = options.baseUrl ?? CLINE_CHAT_BASE_URL
  const shared = {
    providerId: PROVIDER_ID,
    baseUrl,
    apiKey: options.apiKey,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  }

  const catalog = createCatalog({
    ...shared,
    ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}),
  })
  const client = createChatClient(shared)
  const streaming = createStreamingClient({
    baseUrl,
    apiKey: options.apiKey,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  })

  const thinkingFor = async (modelId: string) =>
    (await catalog.get(modelId))?.thinking ?? { reasoning: false, kind: 'unknown' as const, levels: [] }

  return {
    id: PROVIDER_ID,
    name: 'ClinePass',
    catalog,
    listModels: () => catalog.list(),
    refreshModels: () => catalog.refresh(),
    contextWindowFor: async (modelId) => (await catalog.get(modelId))?.context ?? FALLBACK_CONTEXT_WINDOW,
    thinkingFor,
    supportsImages: async (modelId) => {
      try {
        return (await catalog.get(modelId))?.images ?? false
      } catch {
        return false
      }
    },
    supportsToolCalls: async (modelId) => {
      try {
        return (await catalog.get(modelId))?.tools ?? false
      } catch {
        return false
      }
    },
    chat: async (request) => {
      const thinking = await thinkingFor(request.model)
      return client.chat(await verifiedThinkingRequest(request, thinkingFor), { includeReasoning: thinking.reasoning })
    },
    streamChat: async function* (request) {
      const thinking = await thinkingFor(request.model)
      yield* streaming.stream(await verifiedThinkingRequest(request, thinkingFor), { includeReasoning: thinking.reasoning })
    },
  }
}

export { CLINE_API_BASE_URL, CLINE_CHAT_BASE_URL } from './endpoints'
export { PROVIDER_ID } from './oauth/constants'
