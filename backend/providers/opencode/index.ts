/**
 * OpenCode Go.
 *
 * A subscription tier on the same host as Zen, differing by base path. The
 * catalog comes from the vendor, so the model list is whatever Go currently
 * serves rather than whatever was compiled in.
 */

import type { FetchLike, Provider } from '../types'
import { createCatalog, type Catalog } from './catalog'
import { createChatClient } from './client'
import { createStreamingClient } from './stream'
import { OPENCODE_GO_BASE_URL } from './endpoints'
import { createLimitsSource, type LimitsSource } from './limits'

export interface OpenCodeProviderOptions {
  /** Defaults to the Go subscription path. */
  baseUrl?: string
  apiKey: string
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
  /** Injected for tests; otherwise read from models.dev. */
  limits?: LimitsSource
}

export interface OpenCodeProvider extends Provider {
  /** The cached catalog, exposed so a caller can force a refetch. */
  catalog: Catalog
  /** Where context windows come from, exposed for the same reason. */
  limits: LimitsSource
}

export function createOpenCodeProvider(options: OpenCodeProviderOptions): OpenCodeProvider {
  const baseUrl = options.baseUrl ?? OPENCODE_GO_BASE_URL

  const catalog = createCatalog({
    providerId: 'opencode-go',
    baseUrl,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  })

  const streaming = createStreamingClient({
    baseUrl,
    apiKey: options.apiKey,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  })

  const client = createChatClient({
    providerId: 'opencode-go',
    baseUrl,
    apiKey: options.apiKey,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  })

  // The catalog has no context windows, so they come from models.dev.
  const limits =
    options.limits ??
    createLimitsSource({
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    })

  return {
    id: 'opencode-go',
    name: 'OpenCode Go',
    catalog,
    limits,
    listModels: () => catalog.list(),
    refreshModels: () => catalog.refresh(),
    contextWindowFor: (modelId) => limits.contextWindowFor(modelId),
    thinkingFor: (modelId) => limits.thinkingFor(modelId),
    supportsImages: (modelId) => limits.imagesFor(modelId),
    supportsToolCalls: (modelId) => limits.toolsFor(modelId),
    chat: (request) => client.chat(request),
    streamChat: (request) => streaming.stream(request),
  }
}
