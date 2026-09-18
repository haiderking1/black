import type { ProjectItemData } from '../spotlight'

export const PROJECTS_STORAGE_KEY = 'black_projects'
export const ACTIVE_PROJECT_STORAGE_KEY = 'black_active_project_id'

export const DEFAULT_PROJECTS: ProjectItemData[] = [
  { id: 'proj-black', name: 'black', path: '/home/soka/code/black' }
]

export interface ProjectStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function isProjectItem(value: unknown): value is ProjectItemData {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.path === 'string'
}

/**
 * Decode a saved project list.
 *
 * One invalid entry rejects the whole payload. Mixing a repaired subset with
 * the defaults would silently drop projects the user still expects to see.
 */
export function parseProjects(value: unknown): ProjectItemData[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (!value.every(isProjectItem)) return undefined
  return value
}

export function loadProjects(storage: ProjectStorage): ProjectItemData[] {
  try {
    const raw = storage.getItem(PROJECTS_STORAGE_KEY)
    if (raw === null) return [...DEFAULT_PROJECTS]
    return parseProjects(JSON.parse(raw)) ?? [...DEFAULT_PROJECTS]
  } catch {
    return [...DEFAULT_PROJECTS]
  }
}

export function saveProjects(storage: ProjectStorage, projects: readonly ProjectItemData[]): void {
  try {
    storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
  } catch {
    // Quota or serialization failure: in-memory state stays usable
  }
}

export function loadActiveProjectId(storage: ProjectStorage): string {
  try {
    const saved = storage.getItem(ACTIVE_PROJECT_STORAGE_KEY)
    if (saved) return saved
  } catch {
    // ignore
  }
  return DEFAULT_PROJECTS[0]?.id ?? ''
}

export function saveActiveProjectId(storage: ProjectStorage, activeId: string): void {
  try {
    if (activeId) {
      storage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeId)
    } else {
      storage.removeItem(ACTIVE_PROJECT_STORAGE_KEY)
    }
  } catch {
    // ignore
  }
}

export function resolveActiveProject(
  projects: readonly ProjectItemData[],
  activeId: string
): ProjectItemData | undefined {
  return projects.find((project) => project.id === activeId) ?? projects[0]
}

/** Keep a pointer that still names a project; otherwise fall back to the first. */
export function repairedActiveProjectId(
  projects: readonly ProjectItemData[],
  activeId: string
): string {
  if (projects.length === 0) return activeId
  if (projects.some((project) => project.id === activeId)) return activeId
  return projects[0]?.id ?? ''
}

export function addProject(
  projects: readonly ProjectItemData[],
  project: ProjectItemData
): { projects: readonly ProjectItemData[]; activeId: string } {
  const exists = projects.find((candidate) => candidate.path === project.path)
  if (exists) return { projects, activeId: exists.id }
  return { projects: [project, ...projects], activeId: project.id }
}

export function removeProject(
  projects: readonly ProjectItemData[],
  activeId: string,
  id: string
): { projects: ProjectItemData[]; activeId: string } {
  const remaining = projects.filter((project) => project.id !== id)
  if (activeId === id) {
    return { projects: remaining, activeId: remaining[0]?.id ?? '' }
  }
  return { projects: remaining, activeId }
}
