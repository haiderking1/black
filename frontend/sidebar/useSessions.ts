import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectItemData } from '../spotlight'
import {
  createSessionRecord,
  deriveSessionTitle,
  loadActiveSessions,
  loadSessions,
  removeSessionById,
  saveActiveSessions,
  saveSessions
} from './sessionStore'
import type { SessionRecord } from './types'

export interface UseSessionsResult {
  sessions: SessionRecord[]
  activeSessionId: string | undefined
  setActiveSession: (projectId: string, sessionId: string) => void
  createSession: (projectId: string) => SessionRecord
  renameSession: (sessionId: string, title: string, expectedTitle?: string) => void
  deleteSession: (sessionId: string) => void
  touchSession: (sessionId: string) => void
  deleteSessionsForProject: (projectId: string) => void
}

export function useSessions(projects: ProjectItemData[], activeProjectId: string): UseSessionsResult {
  const [sessions, setSessions] = useState<SessionRecord[]>(loadSessions)
  const [activeByProject, setActiveByProject] = useState<Record<string, string>>(loadActiveSessions)

  const sessionsRef = useRef(sessions)
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  // Reconcile stored sessions with the known project list in one pass:
  // drop sessions whose project no longer exists and prune stale pointers.
  // Sessions are created only when the user explicitly starts one.
  useEffect(() => {
    setSessions((prev) => {
      const knownIds = new Set(projects.map((p) => p.id))
      const kept = prev.filter((s) => knownIds.has(s.projectId))
      return kept.length === prev.length ? prev : kept
    })

    setActiveByProject((prev) => {
      const next: Record<string, string> = {}
      let changed = false
      for (const [projectId, sessionId] of Object.entries(prev)) {
        const projectExists = projects.some((p) => p.id === projectId)
        const sessionExists = sessionsRef.current.some((s) => s.id === sessionId)
        if (projectExists && sessionExists) {
          next[projectId] = sessionId
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [projects])

  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  useEffect(() => {
    saveActiveSessions(activeByProject)
  }, [activeByProject])

  // The active session of the active project: explicit pointer if still valid,
  // otherwise the most recently touched session of that project.
  const activeSessionId = useMemo<string | undefined>(() => {
    if (activeProjectId === '') return undefined
    const explicit = activeByProject[activeProjectId]
    if (
      explicit !== undefined &&
      sessions.some((s) => s.id === explicit && s.projectId === activeProjectId)
    ) {
      return explicit
    }
    let latest: SessionRecord | undefined
    for (const s of sessions) {
      if (s.projectId !== activeProjectId) continue
      if (latest === undefined || s.updatedAt > latest.updatedAt) latest = s
    }
    return latest?.id
  }, [activeByProject, sessions, activeProjectId])

  const setActiveSession = useCallback((projectId: string, sessionId: string): void => {
    const exists = sessionsRef.current.some((s) => s.id === sessionId && s.projectId === projectId)
    if (!exists) return
    setActiveByProject((prev) => ({ ...prev, [projectId]: sessionId }))
  }, [])

  const createSession = useCallback((projectId: string): SessionRecord => {
    const record = createSessionRecord(projectId)
    setSessions((prev) => [...prev, record])
    setActiveByProject((prev) => ({ ...prev, [projectId]: record.id }))
    return record
  }, [])

  const renameSession = useCallback((sessionId: string, title: string, expectedTitle?: string): void => {
    const nextTitle = deriveSessionTitle(title)
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId && (expectedTitle === undefined || s.title === expectedTitle) ? { ...s, title: nextTitle } : s))
    )
  }, [])

  const deleteSession = useCallback((sessionId: string): void => {
    const session = sessionsRef.current.find((candidate) => candidate.id === sessionId)
    if (session === undefined) return

    setSessions((prev) => removeSessionById(prev, sessionId))
    setActiveByProject((prev) => {
      if (prev[session.projectId] !== sessionId) return prev
      const next = { ...prev }
      delete next[session.projectId]
      return next
    })
  }, [])

  const touchSession = useCallback((sessionId: string): void => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, updatedAt: Date.now() } : s))
    )
  }, [])

  const deleteSessionsForProject = useCallback((projectId: string): void => {
    setSessions((prev) => prev.filter((s) => s.projectId !== projectId))
    setActiveByProject((prev) => {
      if (!(projectId in prev)) return prev
      const next = { ...prev }
      delete next[projectId]
      return next
    })
  }, [])

  return {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    renameSession,
    deleteSession,
    touchSession,
    deleteSessionsForProject
  }
}
