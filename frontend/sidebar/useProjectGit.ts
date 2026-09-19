import { useEffect, useState } from 'react'
import * as Effect from 'effect/Effect'
import { useRpcClient } from '../rpc'
import type { GitBranchResult } from '../../contracts/fs'

const gitCache = new Map<string, GitBranchResult>()
const refreshListeners = new Set<() => void>()

/** Tools can change any open repository, regardless of the selected session. */
export function refreshProjectGit(): void {
  gitCache.clear()
  for (const refresh of refreshListeners) refresh()
}

export function useProjectGit(projectPath: string | undefined): GitBranchResult {
  const client = useRpcClient()
  const [gitInfo, setGitInfo] = useState<GitBranchResult>(() => {
    if (!projectPath) return { isRepo: false, branch: null }
    return gitCache.get(projectPath) ?? { isRepo: false, branch: null }
  })

  useEffect(() => {
    setGitInfo(projectPath ? gitCache.get(projectPath) ?? { isRepo: false, branch: null } : { isRepo: false, branch: null })
    if (!projectPath || !client) return

    let disposed = false
    let pending = false
    let dirty = false
    const controller = new AbortController()
    const refresh = async (): Promise<void> => {
      dirty = true
      if (pending) return
      pending = true
      try {
        do {
          dirty = false
          try {
            const result = await Effect.runPromise(client['fs.getGitBranch']({ path: projectPath }), { signal: controller.signal })
            // A tool finished during this read: fetch again before publishing.
            if (!disposed && !dirty) {
              gitCache.set(projectPath, result)
              setGitInfo(result)
            }
          } catch {
            // A transport failure is not evidence that the repository vanished.
          }
        } while (dirty && !disposed)
      } finally {
        pending = false
      }
    }

    const onRefresh = (): void => { void refresh() }
    refreshListeners.add(onRefresh)
    onRefresh()
    return () => {
      disposed = true
      refreshListeners.delete(onRefresh)
      controller.abort()
    }
  }, [projectPath, client])

  return gitInfo
}
