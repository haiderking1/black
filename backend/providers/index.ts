/**
 * The provider registry.
 *
 * Providers are built once at startup and looked up by id. A provider whose
 * credentials are missing is left out rather than registered in a broken state,
 * so a caller can list what is actually usable.
 */

import { createOpenCodeProvider, type OpenCodeProvider } from './opencode'
import { OPENCODE_GO_BASE_URL } from './opencode/endpoints'
import { resolveApiKey } from './credentials'
import type { Provider } from './types'

export interface ProviderRegistry {
  get(id: string): Provider | undefined
  list(): Provider[]
}

export function createProviderRegistry(providers: Provider[]): ProviderRegistry {
  const byId = new Map<string, Provider>()
  for (const provider of providers) byId.set(provider.id, provider)
  return {
    get: (id) => byId.get(id),
    list: () => [...byId.values()],
  }
}

/**
 * Build the providers this install can actually use.
 *
 * A key is read from the environment first, then black's auth file. Without one
 * the provider is skipped, which keeps a missing credential from surfacing as a
 * failed request later.
 */
export function createDefaultRegistry(): ProviderRegistry {
  const providers: Provider[] = []

  const openCodeKey = resolveApiKey('opencode-go')
  if (openCodeKey !== undefined) {
    providers.push(createOpenCodeProvider({ apiKey: openCodeKey }))
  }

  return createProviderRegistry(providers)
}

export * from './types'
export * from './errors'
export { createTtlCache, type TtlCache, type TtlCacheOptions } from './cache'
export { resolveApiKey } from './credentials'
export { createOpenCodeProvider, type OpenCodeProvider, type OpenCodeProviderOptions } from './opencode'
export { createCatalog, DEFAULT_CATALOG_TTL_MS, type Catalog, type CatalogOptions } from './opencode/catalog'
export { createChatClient, type ChatClientOptions } from './opencode/client'
export {
  createLimitsSource,
  DEFAULT_LIMITS_TTL_MS,
  FALLBACK_CONTEXT_WINDOW,
  MODELS_DEV_URL,
  type LimitsSource,
  type ModelLimits
} from './opencode/limits'
export { extractContent, type ExtractedContent } from './opencode/reasoning'
export {
  CHAT_COMPLETIONS_PATH,
  MODELS_PATH,
  OPENCODE_GO_BASE_URL,
  OPENCODE_ZEN_BASE_URL,
  joinUrl
} from './opencode/endpoints'
export { OPENCODE_GO_BASE_URL as DEFAULT_BASE_URL }
