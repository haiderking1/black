import { ProviderError, describeError, messageFromBody, readErrorBody } from '../errors'
import { createTtlCache, type TtlCache } from '../cache'
import type { FetchLike, ModelEndpoint } from '../types'
import { endpointsPath, joinUrl } from './endpoints'
import { parseEndpoints } from './routing'

export const DEFAULT_ENDPOINTS_TTL_MS = 60 * 1000

export interface HostListOptions {
  providerId: string
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
}

export interface HostLists {
  list(modelId: string): Promise<readonly ModelEndpoint[]>
  invalidate(): void
}

export function createHostLists(options: HostListOptions): HostLists {
  const doFetch = options.fetchImpl ?? fetch
  const lists = new Map<string, TtlCache<readonly ModelEndpoint[]>>()

  const cacheFor = (modelId: string): TtlCache<readonly ModelEndpoint[]> => {
    const existing = lists.get(modelId)
    if (existing !== undefined) return existing

    const cache = createTtlCache(async () => {
      let path: string
      try {
        path = endpointsPath(modelId)
      } catch (error) {
        throw new ProviderError(
          options.providerId,
          'bad_request',
          describeError(error),
        )
      }

      let response: Response
      try {
        response = await doFetch(joinUrl(options.baseUrl, path), {
          headers: { Authorization: 'Bearer ' + options.apiKey },
        })
      } catch (error) {
        throw new ProviderError(
          options.providerId,
          'network',
          describeError(error),
        )
      }

      if (!response.ok) {
        const body = await readErrorBody(response)
        throw new ProviderError(
          options.providerId,
          response.status === 429 ? 'rate_limit' : response.status === 404 ? 'bad_request' : 'server',
          messageFromBody(body, 'Endpoint list failed with status ' + response.status),
          response.status,
        )
      }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new ProviderError(options.providerId, 'malformed_response', 'Endpoint list was not JSON')
      }

      return parseEndpoints(body)
    }, {
      ttlMs: options.ttlMs ?? DEFAULT_ENDPOINTS_TTL_MS,
      ...(options.now !== undefined ? { now: options.now } : {}),
    })

    lists.set(modelId, cache)
    return cache
  }

  return {
    list: (modelId) => cacheFor(modelId).get(),
    invalidate: () => {
      for (const cache of lists.values()) cache.invalidate()
      lists.clear()
    },
  }
}
