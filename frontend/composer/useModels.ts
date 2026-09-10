import { useCallback, useEffect, useState } from 'react'
import * as Effect from 'effect/Effect'

import type { ModelInfo } from '../../contracts/providers'
import { describeRpcError, useRpcClient } from '../rpc'

export interface UseModelsResult {
  models: readonly ModelInfo[]
  isLoading: boolean
  /** Set when the catalog could not be read, for example before a key exists. */
  error: string | null
  reload: () => Promise<void>
}

/**
 * The models a provider currently serves.
 *
 * Read from the provider's own catalog over the wire, so the list reflects what
 * the vendor offers rather than anything compiled in. A missing key is reported
 * as an error rather than an empty list, so the picker can say why it is empty.
 */
export function useModels(providerId: string): UseModelsResult {
  const client = useRpcClient()
  const [models, setModels] = useState<readonly ModelInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    if (client === null || providerId === '') return
    setIsLoading(true)
    try {
      const result = await Effect.runPromise(client['providers.listModels']({ providerId }))
      setModels([...result])
      setError(null)
    } catch (caught) {
      setModels([])
      setError(describeRpcError(caught))
    } finally {
      setIsLoading(false)
    }
  }, [client, providerId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { models, isLoading, error, reload }
}
