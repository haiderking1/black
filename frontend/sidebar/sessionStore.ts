import type { SessionRecord } from './types'

const SESSIONS_KEY = 'black_sessions_v1'
const ACTIVE_SESSIONS_KEY = 'black_active_sessions_v1'

export const DEFAULT_SESSION_TITLE = 'New chat'
export const MAX_SESSION_TITLE_LENGTH = 80

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function generateId(prefix: string): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return `${prefix}-${cryptoRef.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createSessionRecord(projectId: string): SessionRecord {
  const now = Date.now()
  return {
    id: generateId('session'),
    projectId,
    title: DEFAULT_SESSION_TITLE,
    createdAt: now,
    updatedAt: now
  }
}

export function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (raw === null) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const seenIds = new Set<string>()
    const records: SessionRecord[] = []

    for (const item of parsed) {
      if (!isRecord(item)) continue
      const { id, projectId, title, createdAt, updatedAt } = item
      if (typeof id !== 'string' || id === '') continue
      if (typeof projectId !== 'string' || projectId === '') continue
      if (typeof title !== 'string') continue
      const createdAtNum =
        typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : Date.now()
      const updatedAtNum =
        typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : createdAtNum
      if (seenIds.has(id)) continue
      seenIds.add(id)
      records.push({
        id,
        projectId,
        title: title.trim() || DEFAULT_SESSION_TITLE,
        createdAt: createdAtNum,
        updatedAt: updatedAtNum
      })
    }

    return records
  } catch {
    // Corrupt or unreadable storage: start from a clean slate
    return []
  }
}

export function saveSessions(sessions: SessionRecord[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    // Quota or serialization failure: in-memory state stays usable
  }
}

export function loadActiveSessions(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSIONS_KEY)
    if (raw === null) return {}

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return {}

    const active: Record<string, string> = {}
    for (const [projectId, sessionId] of Object.entries(parsed)) {
      if (projectId !== '' && typeof sessionId === 'string' && sessionId !== '') {
        active[projectId] = sessionId
      }
    }
    return active
  } catch {
    return {}
  }
}

export function saveActiveSessions(active: Record<string, string>): void {
  try {
    localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(active))
  } catch {
    // Ignore persistence failures
  }
}

export function deriveSessionTitle(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim()
  if (collapsed === '') return DEFAULT_SESSION_TITLE
  if (collapsed.length > MAX_SESSION_TITLE_LENGTH) {
    return `${collapsed.slice(0, MAX_SESSION_TITLE_LENGTH - 1)}…`
  }
  return collapsed
}

export function removeSessionById(
  sessions: SessionRecord[],
  sessionId: string
): SessionRecord[] {
  if (!sessions.some((session) => session.id === sessionId)) return sessions
  return sessions.filter((session) => session.id !== sessionId)
}
