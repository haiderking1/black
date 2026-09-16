/**
 * Provider credentials.
 *
 * An environment variable wins, so a shell can override without editing files.
 * Otherwise the key comes from black's own agent directory, which is the same
 * place the rest of the configuration lives. OAuth providers refresh under an
 * in-process lock so concurrent turns cannot rotate the same token twice.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { getAgentDir } from '../config/agentDir'
import { readOAuth, writeOAuth } from './credentialStore'
import { refreshOpenAICodexToken, type FetchLike } from './codex/oauth'

/** Environment variable per provider, checked before the credentials file. */
const ENV_BY_PROVIDER: Record<string, string> = {
  'opencode-go': 'OPENCODE_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
}

const DEFAULT_OAUTH_MINIMUM_VALIDITY_MS = 5 * 60 * 1000
const DEFAULT_OAUTH_REFRESH_TIMEOUT_MS = 15_000

interface AuthFile {
  [providerId: string]: unknown
}

const refreshChains = new Map<string, Promise<unknown>>()

function enqueueRefresh<T>(providerId: string, task: () => Promise<T>): Promise<T> {
  const previous = refreshChains.get(providerId) ?? Promise.resolve()
  const queued = previous.catch(() => {}).then(task)
  const tail = queued.catch(() => {})
  refreshChains.set(providerId, tail)
  void tail.then(() => {
    if (refreshChains.get(providerId) === tail) refreshChains.delete(providerId)
  })
  return queued
}

function readAuthFile(): AuthFile {
  const path = join(getAgentDir(), 'auth.json')
  if (!existsSync(path)) return {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as AuthFile
  } catch {
    return {}
  }
}

/** Pull an apiKey out of one provider's entry, tolerating a bare string. */
function keyFromEntry(entry: unknown): string | undefined {
  if (typeof entry === 'string' && entry !== '') return entry
  if (typeof entry !== 'object' || entry === null) return undefined
  const candidate = (entry as { apiKey?: unknown; api_key?: unknown }).apiKey
  if (typeof candidate === 'string' && candidate !== '') return candidate
  const snake = (entry as { api_key?: unknown }).api_key
  if (typeof snake === 'string' && snake !== '') return snake
  return undefined
}

function envKey(providerId: string): string | undefined {
  const envName = ENV_BY_PROVIDER[providerId]
  if (envName === undefined) return undefined
  const fromEnv = process.env[envName]
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return undefined
}

/**
 * Resolve a provider's API key, or undefined when none is configured.
 * Callers decide how to report a missing key; this stays a lookup.
 *
 * OAuth access tokens are returned as they are stored. Chat and catalog
 * fetches that need a live token should call `resolveAccessToken` instead.
 */
export function resolveApiKey(providerId: string): string | undefined {
  const fromEnv = envKey(providerId)
  if (fromEnv !== undefined) return fromEnv
  const fromFile = keyFromEntry(readAuthFile()[providerId])
  if (fromFile !== undefined) return fromFile
  return readOAuth(providerId)?.access
}

export function isAuthenticated(providerId: string): boolean {
  return resolveApiKey(providerId) !== undefined
}

export interface ResolveAccessTokenOptions {
  signal?: AbortSignal
  fetchImpl?: FetchLike
  now?: () => number
  minValidityMs?: number
}

/**
 * A usable bearer token, refreshing OAuth when less than five minutes remain.
 *
 * Refresh runs under a per-provider queue and re-reads the file inside it, so
 * two overlapping turns cannot both exchange a rotated refresh token.
 */
export async function resolveAccessToken(
  providerId: string,
  options: ResolveAccessTokenOptions = {},
): Promise<string | undefined> {
  const fromEnv = envKey(providerId)
  if (fromEnv !== undefined) return fromEnv
  const fromFile = keyFromEntry(readAuthFile()[providerId])
  if (fromFile !== undefined) return fromFile

  const stored = readOAuth(providerId)
  if (stored === undefined) return undefined

  const now = options.now ?? Date.now
  const minimumValidityMs = options.minValidityMs ?? DEFAULT_OAUTH_MINIMUM_VALIDITY_MS
  if (now() + minimumValidityMs < stored.expires) return stored.access

  return enqueueRefresh(providerId, async () => {
    const current = readOAuth(providerId)
    if (current === undefined) return undefined
    if (now() + minimumValidityMs < current.expires) return current.access

    const timeout = AbortSignal.timeout(DEFAULT_OAUTH_REFRESH_TIMEOUT_MS)
    const signal =
      options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout])
    const next = await refreshOpenAICodexToken(
      current.refresh,
      signal,
      options.fetchImpl,
    )
    writeOAuth(providerId, next)
    return next.access
  })
}
