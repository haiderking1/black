import { useCallback, useEffect, useState } from 'react'
import * as Effect from 'effect/Effect'

import type { ModelInfo } from '../../contracts/providers'
import { describeRpcError, useRpcClient } from '../rpc'
import { readCached, writeCached } from '../rpc/resourceCache'

export interface UseModelsResult {
  models: readonly ModelInfo[]
  isLoading: boolean
  /** Set when the catalog could not be read, for example before a key exists. */
  error: string | null
  reload: () => Promise<void>
}

/** One key per provider, since each serves its own catalog. */
function cacheKey(providerId: string): string {
  return 'providers.listModels:' + providerId
}

/**
 * The models a provider currently serves.
 *
 * Read from the provider's own catalog over the wire, so the list reflects what
 * the vendor offers rather than anything compiled in. A missing key is reported
 * as an error rather than an empty list, so the picker can say why it is empty.
 *
 * The last catalog is held outside the component. The composer unmounts whenever
 * the reader opens settings, and refetching on the way back made the picker
 * flash an empty list every time.
 */
export function useModels(providerId: string): UseModelsResult {
  const client = useRpcClient()
  const key = cacheKey(providerId)

  const [models, setModels] = useState<readonly ModelInfo[]>(() => readCached<readonly ModelInfo[]>(key) ?? [])
  const [isLoading, setIsLoading] = useState(() => !hasCachedModels(key))
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    if (client === null || providerId === '') return

    // Only a first read has nothing to show. A refresh leaves the picker
    // populated and swaps the catalog when the answer lands.
    setIsLoading(!hasCachedModels(key))

    try {
      const next = [...(await Effect.runPromise(client['providers.listModels']({ providerId })))]
      writeCached(key, next)
      setModels(next)
      setError(null)
    } catch (caught) {
      // The cached catalog is dropped too, so a screen that failed to read does
      // not come back showing a list the server has since refused to give.
      writeCached(key, [])
      setModels([])
      setError(describeRpcError(caught))
    } finally {
      setIsLoading(false)
    }
  }, [client, key, providerId])

  useEffect(() => {
    // A different provider is a different catalog. Paint whatever was last read
    // for it before the refresh, rather than the previous provider's models.
    setModels(readCached<readonly ModelInfo[]>(key) ?? [])
    void reload()
  }, [key, reload])

  return { models, isLoading, error, reload }
}

/** Written as a function so the intent reads the same at both call sites. */
function hasCachedModels(key: string): boolean {
  return readCached<readonly ModelInfo[]>(key) !== undefined
}
