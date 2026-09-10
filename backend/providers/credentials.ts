/**
 * Provider credentials.
 *
 * An environment variable wins, so a shell can override without editing files.
 * Otherwise the key comes from black's own agent directory, which is the same
 * place the rest of the configuration lives.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { getAgentDir } from '../config/agentDir'

/** Environment variable per provider, checked before the credentials file. */
const ENV_BY_PROVIDER: Record<string, string> = {
  'opencode-go': 'OPENCODE_API_KEY',
  opencode: 'OPENCODE_API_KEY',
}

interface AuthFile {
  [providerId: string]: unknown
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

/**
 * Resolve a provider's API key, or undefined when none is configured.
 * Callers decide how to report a missing key; this stays a lookup.
 */
export function resolveApiKey(providerId: string): string | undefined {
  const envName = ENV_BY_PROVIDER[providerId]
  if (envName !== undefined) {
    const fromEnv = process.env[envName]
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  }
  return keyFromEntry(readAuthFile()[providerId])
}
