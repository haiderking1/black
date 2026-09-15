import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Effect from 'effect/Effect'

import type { ModelInfo } from '../../contracts/providers'
import { describeRpcError, useRpcClient } from '../rpc'
import { readModelCache, writeModelCache } from './models/cache'

export interface UseModelsResult {
  models: readonly ModelInfo[]
  isLoading: boolean
  /** Refresh errors leave the last successful catalog available. */
  error: string | null
  reload: () => Promise<void>
}

function cachedState(providerId: string) {
  const models = readModelCache(providerId)
  return { providerId, models: models ?? [], isLoading: providerId !== '' && models === undefined, error: null as string | null }
}

/** Paint the persisted catalog immediately, then refresh it in the background. */
export function useModels(providerId: string): UseModelsResult {
  const client = useRpcClient()
  const initial = useMemo(() => cachedState(providerId), [providerId])
  const [state, setState] = useState(initial)
  const pending = useRef<AbortController | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    if (client === null || providerId === '') return
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setState(cachedState(providerId))
    try {
      const models = await Effect.runPromise(client['providers.listModels']({ providerId }), { signal: controller.signal })
      if (controller.signal.aborted || pending.current !== controller) return
      writeModelCache(providerId, models)
      setState({ ...cachedState(providerId), isLoading: false })
    } catch (caught) {
      if (controller.signal.aborted || pending.current !== controller) return
      setState({ ...cachedState(providerId), isLoading: false, error: describeRpcError(caught) })
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }, [client, providerId])

  useEffect(() => {
    setState(cachedState(providerId))
    void reload()
    return () => { pending.current?.abort(); pending.current = null }
  }, [providerId, reload])

  // Do not show the previous provider's catalog for one render during a switch.
  const visible = state.providerId === providerId ? state : initial
  return { models: visible.models, isLoading: visible.isLoading, error: visible.error, reload }
}
