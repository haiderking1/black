import * as Effect from 'effect/Effect'

import { ProviderConfigError } from '../../../contracts/errors'
import { METHODS } from '../../../contracts/methods'
import { clearApiKey, readProviderEnabled, writeApiKey, writeProviderEnabled } from '../../providers/credentialStore'
import { resolveApiKey } from '../../providers/credentials'
import { findDescriptor, PROVIDER_DESCRIPTORS } from '../../providers/descriptors'
import { createOpenCodeProvider } from '../../providers/opencode'
import type { Provider } from '../../providers/types'

/**
 * Provider configuration handlers.
 *
 * A key is written to the agent directory and never read back to the renderer.
 * The status returned here says whether a key exists, not what it is.
 */

export interface ProviderStatus {
  id: string
  name: string
  baseUrl: string
  enabled: boolean
  authenticated: boolean
  modelCount: number | null
}

function asProviderError(error: unknown): ProviderConfigError {
  return new ProviderConfigError({ message: error instanceof Error ? error.message : String(error) })
}

/** Build a provider for a descriptor, or undefined when the id is unknown. */
function buildProvider(providerId: string, apiKey: string): Provider | undefined {
  if (providerId === 'opencode-go') return createOpenCodeProvider({ apiKey })
  return undefined
}

/**
 * Describe one provider.
 *
 * Never throws: a catalog that cannot be read reports a null model count rather
 * than taking the whole settings screen down with it.
 */
async function describeProvider(providerId: string): Promise<ProviderStatus> {
  const descriptor = findDescriptor(providerId)
  if (descriptor === undefined) {
    throw new Error('Unknown provider: ' + providerId)
  }

  const apiKey = resolveApiKey(providerId)
  const authenticated = apiKey !== undefined

  let modelCount: number | null = null
  if (authenticated) {
    try {
      const provider = buildProvider(providerId, apiKey)
      if (provider !== undefined) modelCount = (await provider.listModels()).length
    } catch {
      // The screen still renders; the count is simply unknown.
      modelCount = null
    }
  }

  return {
    id: descriptor.id,
    name: descriptor.name,
    baseUrl: descriptor.baseUrl,
    enabled: readProviderEnabled(descriptor.id),
    authenticated,
    modelCount,
  }
}

export async function listProviderStatuses(): Promise<ProviderStatus[]> {
  const statuses: ProviderStatus[] = []
  for (const descriptor of PROVIDER_DESCRIPTORS) {
    try {
      statuses.push(await describeProvider(descriptor.id))
    } catch {
      // A provider that cannot be described is reported as unconfigured rather
      // than omitted, so the row stays visible and actionable.
      statuses.push({
        id: descriptor.id,
        name: descriptor.name,
        baseUrl: descriptor.baseUrl,
        enabled: readProviderEnabled(descriptor.id),
        authenticated: false,
        modelCount: null,
      })
    }
  }
  return statuses
}

export function providerHandlers() {
  return {
    // Declared with no error channel, and it has none: describing a provider
    // catches internally so one bad catalog cannot fail the settings screen.
    [METHODS.listProviders]: () => Effect.promise(() => listProviderStatuses()),

    [METHODS.setApiKey]: (payload: { providerId: string; apiKey: string }) =>
      Effect.tryPromise({
        try: async () => {
          writeApiKey(payload.providerId, payload.apiKey)
          return await describeProvider(payload.providerId)
        },
        catch: asProviderError,
      }),

    [METHODS.clearApiKey]: (payload: { providerId: string }) =>
      Effect.tryPromise({
        try: async () => {
          clearApiKey(payload.providerId)
          return await describeProvider(payload.providerId)
        },
        catch: asProviderError,
      }),

    // Model ids come from the vendor catalog, which is cached by the provider,
    // so opening the picker repeatedly does not refetch.
    [METHODS.listModels]: (payload: { providerId: string }) =>
      Effect.tryPromise({
        try: async () => {
          const descriptor = findDescriptor(payload.providerId)
          if (descriptor === undefined) throw new Error('Unknown provider: ' + payload.providerId)
          const apiKey = resolveApiKey(payload.providerId)
          if (apiKey === undefined) {
            throw new Error('Configure an API key for ' + descriptor.name + ' first')
          }
          const provider = buildProvider(payload.providerId, apiKey)
          if (provider === undefined) throw new Error('Unknown provider: ' + payload.providerId)

          const models = await provider.listModels()

          // The vendor catalog carries ids only. Reasoning support comes from the
          // limits catalog and is merged here, so the composer can offer the
          // levels this model actually takes rather than a fixed list.
          try {
            return await Promise.all(
              models.map(async (model) => {
                const thinking = await provider.thinkingFor(model.id)
                return {
                  ...model,
                  reasoning: thinking.reasoning,
                  thinkingKind: thinking.kind,
                  thinkingLevels: thinking.levels,
                }
              }),
            )
          } catch {
            // A limits outage should not hide the models themselves.
            return models
          }
        },
        catch: asProviderError,
      }),

    [METHODS.setEnabled]: (payload: { providerId: string; enabled: boolean }) =>
      Effect.tryPromise({
        try: async () => {
          writeProviderEnabled(payload.providerId, payload.enabled)
          return await describeProvider(payload.providerId)
        },
        catch: asProviderError,
      }),
  }
}
