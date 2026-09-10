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
 * The last status read from the server.
 *
 * Module level on purpose. The settings screen unmounts this section when the
 * reader moves to another tab, which takes the component's state with it, so
 * every visit used to start from an empty list: a round trip's worth of
 * "Loading providers" and then the rows popping in, every single time, for an
 * answer that had not changed.
 *
 * Holding it here means a revisit paints the rows it already had and refreshes
 * behind them.
 */
let cachedProviders: readonly ProviderStatus[] = []

/**
 * Provider configuration, read and written over the RPC connection.
 *
 * Keys are never read back from the server, so a key the user typed lives only
 * in this component's state until it is submitted. What comes back is status,
 * not secrets.
 */
export function useProviders(): UseProvidersResult {
  const client = useRpcClient()

  // Seeded from the cache rather than from an empty array, so the first render
  // of a revisit already has something to draw.
  const [providers, setProvidersState] = useState<readonly ProviderStatus[]>(cachedProviders)
  const [isLoading, setIsLoading] = useState(cachedProviders.length === 0)
  const [error, setError] = useState<string | null>(null)

  const setProviders = useCallback((next: readonly ProviderStatus[]): void => {
    cachedProviders = next
    setProvidersState(next)
  }, [])

  const reload = useCallback(async (): Promise<void> => {
    // Still connecting. The effect below runs again once the client arrives,
    // and the empty state should keep saying it is loading until then rather
    // than claiming there are no providers.
    if (client === null) return

    // Only a first read has nothing to show. A refresh leaves the rows up and
    // swaps them when the answer lands, so the screen does not blink.
    setIsLoading(cachedProviders.length === 0)

    try {
      setProviders([...(await Effect.runPromise(client['providers.list']()))])
      setError(null)
    } catch (caught) {
      setError(describeRpcError(caught))
    } finally {
      setIsLoading(false)
    }
  }, [client, setProviders])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Replace one row with the status the server returns after a change. */
  const applyStatus = useCallback(
    (status: ProviderStatus): void => {
      setProviders(cachedProviders.map((entry) => (entry.id === status.id ? status : entry)))
    },
    [setProviders],
  )

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
