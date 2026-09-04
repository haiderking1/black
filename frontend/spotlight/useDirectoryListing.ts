import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DesktopDirectoryEntry } from '../env'

export interface DirectoryListing {
  homeDir: string
  path: string
  parentPath: string | null
  entries: DesktopDirectoryEntry[]
  isLoading: boolean
  error: string | null
  navigate: (targetPath: string) => void
  goUp: () => void
}

/**
 * Loads directory entries through the file-system IPC bridge.
 * Only fetches while the active flag is true; starts at the user's home directory.
 */
export function useDirectoryListing(active: boolean): DirectoryListing {
  const [homeDir, setHomeDir] = useState('')
  const [path, setPath] = useState('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<DesktopDirectoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Start from a clean slate on every activation so the picker never
  // resumes from whatever folder was on screen last time. Runs as a layout
  // effect so the stale listing never gets a chance to paint.
  useLayoutEffect(() => {
    if (!active) return
    setPath('')
    setParentPath(null)
    setEntries([])
    setError(null)
    setIsLoading(false)
  }, [active])

  // Resolve a starting point (home dir, then cwd, then root) when activated
  useEffect(() => {
    if (!active) return

    let cancelled = false
    const init = async () => {
      let start = ''
      try {
        const home = await window.blackDesktop?.getHomeDir()
        if (typeof home === 'string' && home !== '') start = home
      } catch {
        // fall through to cwd
      }
      if (start === '') {
        try {
          const cwd = await window.blackDesktop?.getCwd()
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
  }, [active])

  // Fetch entries whenever the current path changes
  useEffect(() => {
    if (!active || path === '') return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const fetchDir = async () => {
      try {
        const res = await window.blackDesktop?.listDirectory(path)
        if (cancelled || !mountedRef.current) return

        if (res === undefined) {
          setParentPath(null)
          setEntries([])
          setError('File system access is unavailable.')
          return
        }

        setParentPath(res.parentPath)
        if (res.error !== undefined && res.error !== '') {
          setError(res.error)
          setEntries([])
        } else {
          setError(null)
          setEntries(res.entries.filter((e) => e.isDirectory))
        }
      } catch (err) {
        if (cancelled || !mountedRef.current) return
        setError(err instanceof Error ? err.message : String(err))
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
  }, [active, path])

  const navigate = useCallback((targetPath: string): void => {
    if (targetPath === '') return
    setPath(targetPath)
  }, [])

  const goUp = useCallback((): void => {
    setPath((prev) => parentPath ?? prev)
  }, [parentPath])

  return { homeDir, path, parentPath, entries, isLoading, error, navigate, goUp }
}
