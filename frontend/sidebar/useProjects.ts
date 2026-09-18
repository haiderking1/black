import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectItemData } from '../spotlight'
import {
  addProject as insertProject,
  DEFAULT_PROJECTS,
  loadActiveProjectId,
  loadProjects,
  removeProject as dropProject,
  repairedActiveProjectId,
  resolveActiveProject,
  saveActiveProjectId,
  saveProjects
} from './projectStore'

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export interface UseProjectsResult {
  projects: ProjectItemData[]
  activeProjectId: string
  activeProject: ProjectItemData | undefined
  currentProjectId: string
  selectProject: (projectId: string) => void
  addProject: (project: ProjectItemData) => void
  removeProject: (id: string) => void
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectItemData[]>(() => {
    const storage = browserStorage()
    return storage === null ? [...DEFAULT_PROJECTS] : loadProjects(storage)
  })
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const storage = browserStorage()
    return storage === null ? (DEFAULT_PROJECTS[0]?.id ?? '') : loadActiveProjectId(storage)
  })

  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const activeIdRef = useRef(activeProjectId)
  activeIdRef.current = activeProjectId

  const activeProject = resolveActiveProject(projects, activeProjectId)
  const currentProjectId = activeProject?.id ?? ''

  useEffect(() => {
    const storage = browserStorage()
    if (storage === null) return
    saveProjects(storage, projects)
  }, [projects])

  useEffect(() => {
    const storage = browserStorage()
    if (storage === null) return
    saveActiveProjectId(storage, activeProjectId)
  }, [activeProjectId])

  useEffect(() => {
    const next = repairedActiveProjectId(projects, activeProjectId)
    if (next !== activeProjectId) setActiveProjectId(next)
  }, [projects, activeProjectId])

  const selectProject = useCallback((projectId: string): void => {
    setActiveProjectId(projectId)
  }, [])

  const addProject = useCallback((project: ProjectItemData): void => {
    const next = insertProject(projectsRef.current, project)
    activeIdRef.current = next.activeId
    setActiveProjectId(next.activeId)
    if (next.projects === projectsRef.current) return
    const copy = [...next.projects]
    projectsRef.current = copy
    setProjects(copy)
  }, [])

  const removeProject = useCallback((id: string): void => {
    const next = dropProject(projectsRef.current, activeIdRef.current, id)
    projectsRef.current = next.projects
    activeIdRef.current = next.activeId
    setProjects(next.projects)
    setActiveProjectId(next.activeId)
  }, [])

  return {
    projects,
    activeProjectId,
    activeProject,
    currentProjectId,
    selectProject,
    addProject,
    removeProject
  }
}
