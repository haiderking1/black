import { useCallback, useEffect, useState } from 'react'
import * as Effect from 'effect/Effect'

import type { ProviderStatus } from '../../contracts/providers'
import { describeRpcError, useRpcClient } from '../rpc'

export interface UseProvidersResult {
  /** Readonly because the decoded wire value is readonly. */
  providers: readonly ProviderStatus[]
  isLoading: boolean
  error: string | null
  setApiKey: (providerId: string, apiKey: string) => Promise<void>
  clearApiKey: (providerId: string) => Promise<void>
  setEnabled: (providerId: string, enabled: boolean) => Promise<void>
  reload: () => Promise<void>
}

/**
 * Provider configuration, read and written over the RPC connection.
 *
 * Keys are never read back from the server, so a key the user typed lives only
 * in this component's state until it is submitted. What comes back is status,
 * not secrets.
 */
export function useProviders(): UseProvidersResult {
  const client = useRpcClient()
  const [providers, setProviders] = useState<readonly ProviderStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    if (client === null) return
    setIsLoading(true)
    try {
      const result = await Effect.runPromise(client['providers.list']())
      setProviders([...result])
      setError(null)
    } catch (caught) {
      setError(describeRpcError(caught))
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Replace one row with the status the server returns after a change. */
  const applyStatus = useCallback((status: ProviderStatus): void => {
    setProviders((prev) => prev.map((entry) => (entry.id === status.id ? status : entry)))
  }, [])

  const setApiKey = useCallback(
    async (providerId: string, apiKey: string): Promise<void> => {
      if (client === null) return
      try {
        applyStatus(
          await Effect.runPromise(client['providers.setApiKey']({ providerId, apiKey })),
        )
        setError(null)
      } catch (caught) {
        setError(describeRpcError(caught))
        throw caught
      }
    },
    [applyStatus, client],
  )

  const clearApiKey = useCallback(
    async (providerId: string): Promise<void> => {
      if (client === null) return
      try {
        applyStatus(await Effect.runPromise(client['providers.clearApiKey']({ providerId })))
        setError(null)
      } catch (caught) {
        setError(describeRpcError(caught))
      }
    },
    [applyStatus, client],
  )

  const setEnabled = useCallback(
    async (providerId: string, enabled: boolean): Promise<void> => {
      if (client === null) return
      try {
        applyStatus(await Effect.runPromise(client['providers.setEnabled']({ providerId, enabled })))
        setError(null)
      } catch (caught) {
        setError(describeRpcError(caught))
      }
    },
    [applyStatus, client],
  )

  return { providers, isLoading, error, setApiKey, clearApiKey, setEnabled, reload }
}
