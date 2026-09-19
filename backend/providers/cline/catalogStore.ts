/**
 * ClinePass picker cache.
 *
 * createProvider builds a new catalog per RPC, so an instance TTL never
 * survives. This store is process-wide and disk-backed. The live feed is
 * checked when the snapshot is stale. The router list is fetched only when
 * that feed's fingerprint changes.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { getAgentDir } from '../../config/agentDir'

export const CLINE_CATALOG_CACHE_VERSION = 2
export const CLINE_CATALOG_CACHE_FILE = 'cline-catalog.v1.json'

export interface StoredClineCatalog {
  version: typeof CLINE_CATALOG_CACHE_VERSION
  fingerprint: string
  loadedAt: number
  models: unknown
}

export interface CatalogStore {
  read(): StoredClineCatalog | undefined
  write(value: StoredClineCatalog): void
  clear(): void
}

export function clineCatalogCachePath(agentDir = getAgentDir()): string {
  return join(agentDir, 'cache', CLINE_CATALOG_CACHE_FILE)
}

function asStored(value: unknown): StoredClineCatalog | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record['version'] !== CLINE_CATALOG_CACHE_VERSION) return undefined
  if (typeof record['fingerprint'] !== 'string' || record['fingerprint'] === '') return undefined
  if (typeof record['loadedAt'] !== 'number' || !Number.isFinite(record['loadedAt'])) return undefined
  if (!Array.isArray(record['models']) || record['models'].length === 0) return undefined
  return {
    version: CLINE_CATALOG_CACHE_VERSION,
    fingerprint: record['fingerprint'],
    loadedAt: record['loadedAt'],
    models: record['models'],
  }
}

export function createMemoryCatalogStore(initial?: StoredClineCatalog): CatalogStore {
  let value = initial
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    clear: () => {
      value = undefined
    },
  }
}

export function readClineCatalogFile(path: string): StoredClineCatalog | undefined {
  if (!existsSync(path)) return undefined
  try {
    return asStored(JSON.parse(readFileSync(path, 'utf-8')))
  } catch {
    return undefined
  }
}

export function writeClineCatalogFile(path: string, value: StoredClineCatalog): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value) + '\n', 'utf-8')
}

function createDiskCatalogStore(path: string): CatalogStore {
  let memory: StoredClineCatalog | undefined
  return {
    read: () => {
      if (memory !== undefined) return memory
      memory = readClineCatalogFile(path)
      return memory
    },
    write: (next) => {
      memory = next
      try {
        writeClineCatalogFile(path, next)
      } catch {
        // A full disk must not fail the picker. Memory still has the snapshot.
      }
    },
    clear: () => {
      memory = undefined
      try {
        if (existsSync(path)) unlinkSync(path)
      } catch {
        // A stuck file is a stale cache, not a sign-out failure.
      }
    },
  }
}

let processStore: CatalogStore | undefined

/** Shared cache for the live Cline provider. Tests inject their own store. */
export function defaultClineCatalogStore(): CatalogStore {
  processStore ??= createDiskCatalogStore(clineCatalogCachePath())
  return processStore
}

export function clearClineCatalogCache(): void {
  processStore?.clear()
  processStore = undefined
  try {
    const path = clineCatalogCachePath()
    if (existsSync(path)) unlinkSync(path)
  } catch {
    // Sign-out still succeeds if the cache file cannot be removed.
  }
}
