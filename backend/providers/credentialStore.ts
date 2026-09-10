/**
 * Writing provider credentials.
 *
 * The file is written whole under the same lock the rest of the config uses, so
 * a concurrent write cannot interleave. A key is never read back out to the
 * renderer; the settings screen learns only whether one exists.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getAgentDir } from '../config/agentDir'
import { acquireFileLock } from '../config/settings/lock'
import { stripBom } from '../config/text'

interface ProviderEntry {
  apiKey?: string
  enabled?: boolean
  [key: string]: unknown
}

type AuthFile = Record<string, ProviderEntry | string | undefined>

const NEWLINE = String.fromCharCode(10)

export function getAuthFilePath(): string {
  return join(getAgentDir(), 'auth.json')
}

function readAuthFile(path: string): AuthFile {
  if (!existsSync(path)) return {}
  try {
    const parsed: unknown = JSON.parse(stripBom(readFileSync(path, 'utf-8')))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as AuthFile
  } catch {
    // A corrupt file would otherwise make the settings screen unusable. It is
    // replaced on the next write rather than blocking every change.
    return {}
  }
}

/** Normalize an entry that may be a bare string into an object. */
function asEntry(value: ProviderEntry | string | undefined): ProviderEntry {
  if (typeof value === 'string') return { apiKey: value }
  if (typeof value === 'object' && value !== null) return { ...value }
  return {}
}

/** Apply a change to one provider's entry under the file lock. */
function updateProvider(providerId: string, change: (entry: ProviderEntry) => ProviderEntry): void {
  if (providerId === '') throw new Error('A provider id is required')
  const path = getAuthFilePath()
  const lock = acquireFileLock(path)
  try {
    const data = readAuthFile(path)
    const next = change(asEntry(data[providerId]))

    // An entry with nothing left in it is removed rather than left as an empty
    // object, so the file reflects what is actually configured.
    if (Object.keys(next).length === 0) {
      delete data[providerId]
    } else {
      data[providerId] = next
    }

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2) + NEWLINE, 'utf-8')
  } finally {
    lock.release()
  }
}

export function writeApiKey(providerId: string, apiKey: string): void {
  const trimmed = apiKey.trim()
  if (trimmed === '') throw new Error('An API key is required')
  updateProvider(providerId, (entry) => ({ ...entry, apiKey: trimmed }))
}

export function clearApiKey(providerId: string): void {
  updateProvider(providerId, (entry) => {
    delete entry['apiKey']
    return entry
  })
}

export function writeProviderEnabled(providerId: string, enabled: boolean): void {
  updateProvider(providerId, (entry) => ({ ...entry, enabled }))
}

/** Whether a provider is switched on. Absent means on, so a fresh install works. */
export function readProviderEnabled(providerId: string): boolean {
  const entry = readAuthFile(getAuthFilePath())[providerId]
  if (typeof entry !== 'object' || entry === null) return true
  return entry.enabled !== false
}
