/**
 * OpenAI Codex, via a ChatGPT Plus or Pro subscription.
 *
 * Catalog is the set of models that backend currently serves. Chat goes through
 * the Responses endpoint on chatgpt.com, authenticated with an OAuth access
 * token and the ChatGPT account id embedded in it.
 */

import type { FetchLike, Provider } from '../types'
import { verifiedThinkingRequest } from '../thinking/validate'
import {
  contextWindowFor,
  imagesFor,
  listCodexModels,
  thinkingFor,
  toolsFor,
} from './catalog'
import { createChatClient } from './client'
import { CODEX_BASE_URL } from './endpoints'
import { PROVIDER_ID } from './oauth/constants'
import { createStreamingClient } from './stream'

export interface CodexProviderOptions {
  baseUrl?: string
  apiKey: string
  fetchImpl?: FetchLike
}

export function createCodexProvider(options: CodexProviderOptions): Provider {
  const baseUrl = options.baseUrl ?? CODEX_BASE_URL
  const shared = {
    baseUrl,
    apiKey: options.apiKey,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  }
  const client = createChatClient(shared)
  const streaming = createStreamingClient(shared)
  const thinking = async (modelId: string) => thinkingFor(modelId)

  return {
    id: PROVIDER_ID,
    name: 'OpenAI Codex',
    listModels: async () => listCodexModels(),
    refreshModels: async () => listCodexModels(),
    contextWindowFor: async (modelId) => contextWindowFor(modelId),
    thinkingFor: thinking,
    supportsImages: async (modelId) => imagesFor(modelId),
    supportsToolCalls: async (modelId) => toolsFor(modelId),
    chat: async (request) => client.chat(await verifiedThinkingRequest(request, thinking)),
    streamChat: async function* (request) {
      yield* streaming.stream(await verifiedThinkingRequest(request, thinking))
    },
  }
}
