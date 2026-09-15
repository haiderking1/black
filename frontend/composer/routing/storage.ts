import type { ChatRoute } from '../../../contracts/chat'

export type StoredRoute = { sort: 'latency' | 'throughput' } | { only: string }

export interface RouteStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PREFIX = 'black.openrouter.route.v1:'

function keyFor(modelId: string): string {
  return PREFIX + encodeURIComponent(modelId)
}

function browserStorage(): RouteStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function parseRoute(value: unknown): StoredRoute | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as { sort?: unknown; only?: unknown }
  if (typeof record.only === 'string' && record.only.trim() !== '') return { only: record.only.trim() }
  if (record.sort === 'latency' || record.sort === 'throughput') return { sort: record.sort }
  return undefined
}

/** Latency sort is the OpenRouter default this client sends. */
export function defaultRoute(): StoredRoute {
  return { sort: 'latency' }
}

export function readRoute(modelId: string, storage = browserStorage()): StoredRoute {
  if (!modelId) return defaultRoute()
  try {
    const raw = storage?.getItem(keyFor(modelId))
    if (raw === null || raw === undefined) return defaultRoute()
    return parseRoute(JSON.parse(raw)) ?? defaultRoute()
  } catch {
    return defaultRoute()
  }
}

export function writeRoute(modelId: string, route: StoredRoute, storage = browserStorage()): void {
  if (!modelId) return
  try {
    storage?.setItem(keyFor(modelId), JSON.stringify(route))
  } catch {
    // Blocked storage keeps the in-memory choice for this session only.
  }
}

export function toChatRoute(route: StoredRoute): ChatRoute {
  if ('only' in route) return { only: route.only }
  return { sort: route.sort }
}
