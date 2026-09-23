import * as Effect from 'effect/Effect'

import type { ModelInfo } from '../../../contracts/providers'
import { readModelCache, writeModelCache } from './cache'
import {
  catalogInflight,
  clearCatalogInflight,
  forgetCatalogWarm,
  isCatalogWarmed,
  markCatalogWarmed,
  setCatalogInflight,
} from './session'

export interface ModelCatalogClient {
  readonly 'providers.listModels': (
    payload: { providerId: string },
  ) => Effect.Effect<readonly ModelInfo[], unknown>
}

export interface PrefetchableProvider {
  id: string
  enabled: boolean
  authenticated: boolean
  role?: 'chat' | 'service'
}

/** Enabled, signed-in chat providers the picker can actually open. */
export function catalogsToPrefetch(providers: readonly PrefetchableProvider[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const provider of providers) {
    if (provider.role === 'service') continue
    if (!provider.enabled || !provider.authenticated || provider.id === '') continue
    if (seen.has(provider.id)) continue
    seen.add(provider.id)
    ids.push(provider.id)
  }
  return ids
}

export interface LoadCatalogOptions {
  /** Bypass this-run warm and fetch again. */
  force?: boolean
}

/**
 * One in-flight listModels per provider. A warmed catalog returns memory.
 * Last session's disk cache is not warm: the first call this run still pays.
 */
export async function loadProviderModels(
  client: ModelCatalogClient,
  providerId: string,
  options: LoadCatalogOptions = {},
): Promise<readonly ModelInfo[]> {
  if (providerId === '') return []
  const force = options.force === true
  if (!force && isCatalogWarmed(providerId)) {
    return readModelCache(providerId) ?? []
  }
  if (!force) {
    const existing = catalogInflight<ModelInfo>(providerId)
    if (existing !== undefined) return existing
  }

  const request = Effect.runPromise(client['providers.listModels']({ providerId }))
    .then((models) => {
      writeModelCache(providerId, models)
      markCatalogWarmed(providerId)
      return readModelCache(providerId) ?? models
    })
    .finally(() => {
      clearCatalogInflight(providerId, request)
    })
  setCatalogInflight(providerId, request)
  return request
}

/** Warm every ready catalog. One dead vendor does not block the rest. */
export async function prefetchCatalogs(
  client: ModelCatalogClient,
  providerIds: readonly string[],
): Promise<void> {
  const unique = catalogsToPrefetch(
    providerIds
      .filter((id) => id !== '')
      .map((id) => ({ id, enabled: true, authenticated: true })),
  )
  await Promise.all(
    unique.map(async (providerId) => {
      try {
        await loadProviderModels(client, providerId)
      } catch {
        forgetCatalogWarm(providerId)
      }
    }),
  )
}

export { forgetCatalogWarm, isCatalogWarmed }
export { resetCatalogSession } from './session'
