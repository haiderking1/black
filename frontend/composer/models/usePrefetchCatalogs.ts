import { useEffect, useMemo } from 'react'

import type { ProviderStatus } from '../../../contracts/providers'
import { useRpcClient } from '../../rpc'
import { catalogsToPrefetch, prefetchCatalogs } from './prefetch'

/**
 * Pull every picker catalog once the RPC client and provider list are up.
 * The composer and picker then read cache instead of paying on first open.
 */
export function usePrefetchCatalogs(providers: readonly ProviderStatus[]): void {
  const client = useRpcClient()
  const key = useMemo(() => catalogsToPrefetch(providers).join('\0'), [providers])

  useEffect(() => {
    if (client === null || key === '') return
    void prefetchCatalogs(client, key.split('\0'))
  }, [client, key])
}
