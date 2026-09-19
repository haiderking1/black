import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ModelInfo } from '../../contracts/providers'
import { describeRpcError, useRpcClient } from '../rpc'
import { readModelCache } from './models/cache'
import { isCatalogWarmed, loadProviderModels } from './models/prefetch'

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

/** Paint cache immediately. Network happens at app start unless this catalog is still cold. */
export function useModels(providerId: string): UseModelsResult {
  const client = useRpcClient()
  const initial = useMemo(() => cachedState(providerId), [providerId])
  const [state, setState] = useState(initial)

  const reload = useCallback(async (): Promise<void> => {
    if (client === null || providerId === '') return
    setState(cachedState(providerId))
    try {
      await loadProviderModels(client, providerId, { force: true })
      setState({ ...cachedState(providerId), isLoading: false })
    } catch (caught) {
      setState({ ...cachedState(providerId), isLoading: false, error: describeRpcError(caught) })
    }
  }, [client, providerId])

  useEffect(() => {
    setState(cachedState(providerId))
    if (client === null || providerId === '' || isCatalogWarmed(providerId)) return
    let cancelled = false
    void loadProviderModels(client, providerId)
      .then(() => {
        if (cancelled) return
        setState({ ...cachedState(providerId), isLoading: false })
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setState({ ...cachedState(providerId), isLoading: false, error: describeRpcError(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [client, providerId])

  // Do not show the previous provider's catalog for one render during a switch.
  const visible = state.providerId === providerId ? state : initial
  return { models: visible.models, isLoading: visible.isLoading, error: visible.error, reload }
}
