import { useCallback, useEffect, useRef, useState } from 'react'
import * as Effect from 'effect/Effect'

import type { CodexUsage } from '../../contracts/codexUsage'
import { describeRpcError, useRpcClient } from '../rpc'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

let cachedUsage: CodexUsage | null = null

export function useCodexUsage(): {
  usage: CodexUsage | null
  loading: boolean
  refreshing: boolean
  error: string | null
  refresh: () => Promise<void>
} {
  const client = useRpcClient()
  const [usage, setUsage] = useState<CodexUsage | null>(cachedUsage)
  const [loading, setLoading] = useState(cachedUsage === null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)

  const refresh = useCallback((): Promise<void> => {
    if (client === null) return Promise.resolve()
    if (inFlight.current !== null) return inFlight.current
    setRefreshing(true)
    if (cachedUsage === null) setLoading(true)

    const request = (async (): Promise<void> => {
      try {
        const next = await Effect.runPromise(client['providers.codexUsage']())
        cachedUsage = next
        setUsage(next)
        setError(null)
      } catch (caught) {
        setError(describeRpcError(caught))
      } finally {
        setLoading(false)
        setRefreshing(false)
        inFlight.current = null
      }
    })()
    inFlight.current = request
    return request
  }, [client])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  return { usage, loading, refreshing, error, refresh }
}
