import { useCallback, useEffect, useState } from 'react'
import type { ProjectItemData } from '../spotlight'

const EXPANDED_KEY = 'black_expanded_projects_v1'

function loadExpandedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    if (raw === null) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && v !== ''))
  } catch {
    return new Set()
  }
}

export interface UseExpandedProjectsResult {
  expandedIds: ReadonlySet<string>
  toggleProject: (projectId: string) => void
  expandProject: (projectId: string) => void
}

export function useExpandedProjects(projects: ProjectItemData[]): UseExpandedProjectsResult {
  const [expanded, setExpanded] = useState<Set<string>>(loadExpandedIds)

  // Drop entries for removed projects
  useEffect(() => {
    setExpanded((prev) => {
      const known = new Set(projects.map((p) => p.id))
      const next = new Set([...prev].filter((id) => known.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [projects])

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]))
    } catch {
      // Ignore persistence failures
    }
  }, [expanded])

  const toggleProject = useCallback((projectId: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }, [])

  const expandProject = useCallback((projectId: string): void => {
    setExpanded((prev) => {
      if (prev.has(projectId)) return prev
      const next = new Set(prev)
      next.add(projectId)
      return next
    })
  }, [])

  return { expandedIds: expanded, toggleProject, expandProject }
}
