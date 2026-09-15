import { useCallback, useEffect, useRef, useState } from 'react'
import * as Effect from 'effect/Effect'

import type { ModelEndpoint } from '../../../contracts/providers'
import { describeRpcError, useRpcClient } from '../../rpc'

export interface UseEndpointsResult {
  endpoints: readonly ModelEndpoint[]
  isLoading: boolean
  error: string | null
  /** True after the first fetch for this model finishes, success or failure. */
  ready: boolean
}

/** Host list for an OpenRouter model. Other providers have nothing to fetch. */
export function useEndpoints(providerId: string, modelId: string | null): UseEndpointsResult {
  const client = useRpcClient()
  const [endpoints, setEndpoints] = useState<readonly ModelEndpoint[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const pending = useRef<AbortController | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (client === null || providerId !== 'openrouter' || modelId === null || modelId === '') {
      setEndpoints([])
      setIsLoading(false)
      setError(null)
      setReady(providerId !== 'openrouter' || modelId === null || modelId === '')
      return
    }

    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setIsLoading(true)
    setReady(false)
    setError(null)

    try {
      const listed = await Effect.runPromise(
        client['providers.listEndpoints']({ providerId, model: modelId }),
        { signal: controller.signal },
      )
      if (controller.signal.aborted || pending.current !== controller) return
      setEndpoints(listed)
      setError(null)
      setReady(true)
    } catch (caught) {
      if (controller.signal.aborted || pending.current !== controller) return
      setEndpoints([])
      setError(describeRpcError(caught))
      setReady(true)
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setIsLoading(false)
      }
    }
  }, [client, providerId, modelId])

  useEffect(() => {
    void load()
    return () => {
      pending.current?.abort()
      pending.current = null
    }
  }, [load])

  return { endpoints, isLoading, error, ready }
}
