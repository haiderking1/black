import * as Effect from 'effect/Effect'

import { ProviderConfigError } from '../../../contracts/errors'
import { METHODS } from '../../../contracts/methods'
import { clearApiKey, readProviderEnabled, writeApiKey, writeOAuth, writeProviderEnabled } from '../../providers/credentialStore'
import { resolveAccessToken, resolveApiKey } from '../../providers/credentials'
import { findDescriptor, PROVIDER_DESCRIPTORS, type ProviderAuthKind } from '../../providers/descriptors'
import { createProvider } from '../../providers/create'
import {
  cancelBrowserLogin,
  startBrowserLogin,
  submitBrowserLoginCode,
} from '../../providers/codex/oauth'
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
  authKind: ProviderAuthKind
}

export interface ProviderHandlerOptions {
  openUrl: (url: string) => Promise<void>
}

function asProviderError(error: unknown): ProviderConfigError {
  return new ProviderConfigError({ message: error instanceof Error ? error.message : String(error) })
}

function missingCredentialMessage(name: string, authKind: ProviderAuthKind): string {
  if (authKind === 'oauth') return 'Sign in to ' + name + ' first'
  return 'Configure an API key for ' + name + ' first'
}

/** Build a provider for a descriptor, or undefined when the id is unknown. */
function buildProvider(providerId: string, apiKey: string): Provider | undefined {
  return createProvider(providerId, apiKey)
}

function statusFromDescriptor(
  descriptor: { id: string; name: string; baseUrl: string; authKind: ProviderAuthKind },
  fields: { enabled: boolean; authenticated: boolean; modelCount: number | null },
): ProviderStatus {
  return {
    id: descriptor.id,
    name: descriptor.name,
    baseUrl: descriptor.baseUrl,
    authKind: descriptor.authKind,
    ...fields,
  }
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
      modelCount = null
    }
  }

  return statusFromDescriptor(descriptor, {
    enabled: readProviderEnabled(descriptor.id),
    authenticated,
    modelCount,
  })
}

export async function listProviderStatuses(): Promise<ProviderStatus[]> {
  const statuses: ProviderStatus[] = []
  for (const descriptor of PROVIDER_DESCRIPTORS) {
    try {
      statuses.push(await describeProvider(descriptor.id))
    } catch {
      statuses.push(
        statusFromDescriptor(descriptor, {
          enabled: readProviderEnabled(descriptor.id),
          authenticated: false,
          modelCount: null,
        }),
      )
    }
  }
  return statuses
}

async function requireProvider(providerId: string): Promise<Provider> {
  const descriptor = findDescriptor(providerId)
  if (descriptor === undefined) throw new Error('Unknown provider: ' + providerId)
  const apiKey = await resolveAccessToken(providerId)
  if (apiKey === undefined) throw new Error(missingCredentialMessage(descriptor.name, descriptor.authKind))
  const provider = buildProvider(providerId, apiKey)
  if (provider === undefined) throw new Error('Unknown provider: ' + providerId)
  return provider
}

export function providerHandlers(options: ProviderHandlerOptions) {
  return {
    [METHODS.listProviders]: () => Effect.promise(() => listProviderStatuses()),

    [METHODS.setApiKey]: (payload: { providerId: string; apiKey: string }) =>
      Effect.tryPromise({
        try: async () => {
          const descriptor = findDescriptor(payload.providerId)
          if (descriptor?.authKind === 'oauth') {
            throw new Error(descriptor.name + ' uses ChatGPT sign-in, not an API key')
          }
          writeApiKey(payload.providerId, payload.apiKey)
          return await describeProvider(payload.providerId)
        },
        catch: asProviderError,
      }),

    [METHODS.clearApiKey]: (payload: { providerId: string }) =>
      Effect.tryPromise({
        try: async () => {
          cancelBrowserLogin(payload.providerId)
          clearApiKey(payload.providerId)
          return await describeProvider(payload.providerId)
        },
        catch: asProviderError,
      }),

    [METHODS.listModels]: (payload: { providerId: string }) =>
      Effect.tryPromise({
        try: async () => {
          const provider = await requireProvider(payload.providerId)
          const models = await provider.listModels()
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
            return models
          }
        },
        catch: asProviderError,
      }),

    [METHODS.listEndpoints]: (payload: { providerId: string; model: string }) =>
      Effect.tryPromise({
        try: async () => {
          const provider = await requireProvider(payload.providerId)
          if (provider.listEndpoints === undefined) return []
          return [...(await provider.listEndpoints(payload.model))]
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

    [METHODS.startOAuth]: (payload: { providerId: string }) =>
      Effect.tryPromise({
        try: async () => {
          const descriptor = findDescriptor(payload.providerId)
          if (descriptor === undefined) throw new Error('Unknown provider: ' + payload.providerId)
          if (descriptor.authKind !== 'oauth') {
            throw new Error(descriptor.name + ' does not use browser sign-in')
          }
          const credential = await startBrowserLogin({ openUrl: options.openUrl }, payload.providerId)
          writeOAuth(payload.providerId, credential)
          return await describeProvider(payload.providerId)
        },
        catch: asProviderError,
      }),

    [METHODS.cancelOAuth]: (payload: { providerId: string }) =>
      Effect.sync(() => {
        cancelBrowserLogin(payload.providerId)
      }),

    [METHODS.submitOAuthCode]: (payload: { providerId: string; input: string }) =>
      Effect.try({
        try: () => {
          submitBrowserLoginCode(payload.input, payload.providerId)
        },
        catch: asProviderError,
      }),
  }
}
