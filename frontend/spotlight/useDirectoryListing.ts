import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Effect from 'effect/Effect'

import type { DirectoryEntry } from '../../contracts/fs'
import { describeRpcError, useRpcClient } from '../rpc'

export interface DirectoryListing {
  homeDir: string
  path: string
  parentPath: string | null
  entries: DirectoryEntry[]
  isLoading: boolean
  error: string | null
  navigate: (targetPath: string) => void
  goUp: () => void
}

/**
 * Loads directory entries through the RPC connection.
 *
 * Only fetches while the active flag is true; starts at the user's home
 * directory. The connection may not be established on the first activation, in
 * which case the listing reports itself as loading and the effects re-run once
 * the client arrives.
 */
export function useDirectoryListing(active: boolean): DirectoryListing {
  const client = useRpcClient()
  const [homeDir, setHomeDir] = useState('')
  const [path, setPath] = useState('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Start from a clean slate on every activation so the picker never resumes
  // from whatever folder was on screen last time. Runs as a layout effect so the
  // stale listing never gets a chance to paint.
  useLayoutEffect(() => {
    if (!active) return
    setPath('')
    setParentPath(null)
    setEntries([])
    setError(null)
    setIsLoading(false)
  }, [active])

  // Resolve a starting point (home dir, then cwd, then root) when activated.
  useEffect(() => {
    if (!active || client === null) return

    let cancelled = false
    const init = async (): Promise<void> => {
      let start = ''
      try {
        const home = await Effect.runPromise(client['fs.getHomeDir']())
        if (typeof home === 'string' && home !== '') start = home
      } catch {
        // fall through to cwd
      }
      if (start === '') {
        try {
          const cwd = await Effect.runPromise(client['fs.getCwd']())
          if (typeof cwd === 'string' && cwd !== '') start = cwd
        } catch {
          // fall through to root
        }
      }
      if (start === '') start = '/'
      if (!cancelled && mountedRef.current) {
        setHomeDir((prev) => (prev === '' ? start : prev))
        setPath(start)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [active, client])

  // Fetch entries whenever the current path changes.
  useEffect(() => {
    if (!active || client === null || path === '') return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const fetchDir = async (): Promise<void> => {
      try {
        const result = await Effect.runPromise(client['fs.listDirectory']({ path }))
        if (cancelled || !mountedRef.current) return

        setParentPath(result.parentPath)
        if (result.error !== undefined && result.error !== '') {
          setError(result.error)
          setEntries([])
        } else {
          setError(null)
          setEntries(result.entries.filter((entry) => entry.isDirectory))
        }
      } catch (caught) {
        if (cancelled || !mountedRef.current) return
        setError(describeRpcError(caught))
        setParentPath(null)
        setEntries([])
      } finally {
        if (!cancelled && mountedRef.current) setIsLoading(false)
      }
    }

    void fetchDir()
    return () => {
      cancelled = true
    }
  }, [active, client, path])

  const navigate = useCallback((targetPath: string): void => {
    if (targetPath === '') return
    setPath(targetPath)
  }, [])

  const goUp = useCallback((): void => {
    setPath((prev) => parentPath ?? prev)
  }, [parentPath])

  return { homeDir, path, parentPath, entries, isLoading, error, navigate, goUp }
}
