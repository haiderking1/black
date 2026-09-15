import * as Schema from 'effect/Schema'
import { ModelInfo } from '../../../contracts/providers'
import { readCached, writeCached } from '../../rpc/resourceCache'

export interface ModelCacheStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const MAX_CACHE_LENGTH = 2 * 1024 * 1024
const decode = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.Literal(1), models: Schema.Array(ModelInfo) }))
const memoryKey = (providerId: string) => 'providers.listModels:' + providerId
export const modelCacheKey = (providerId: string) => 'black.modelCatalog.v1:' + encodeURIComponent(providerId)

function browserStorage(): ModelCacheStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/** Only catalog data is persisted, never provider credentials. */
export function readModelCache(providerId: string, storage = browserStorage()): readonly ModelInfo[] | undefined {
  if (!providerId) return undefined
  const memory = readCached<readonly ModelInfo[]>(memoryKey(providerId))
  if (memory !== undefined) return memory
  try {
    const raw = storage?.getItem(modelCacheKey(providerId))
    if (!raw || raw.length > MAX_CACHE_LENGTH) return undefined
    const { models } = decode(JSON.parse(raw))
    const ids = new Set(models.map(model => model.id))
    if (ids.size !== models.length || models.some(model => !model.id.trim())) return undefined
    writeCached(memoryKey(providerId), models)
    return models
  } catch {
    // A corrupt or inaccessible cache is a cache miss, not a startup failure.
    return undefined
  }
}

export function writeModelCache(providerId: string, models: readonly ModelInfo[], storage = browserStorage()): void {
  if (!providerId) return
  // A limits-catalog outage returns model IDs without capability fields. Keep
  // last-known capabilities for those IDs, but honor explicit unknown support
  // and drop models that disappeared. The backend still validates every request.
  const previous = new Map(readModelCache(providerId, storage)?.map(model => [model.id, model]))
  const merged = models.map(model => {
    const cached = previous.get(model.id)
    if (!cached || model.thinkingKind !== undefined || model.thinkingLevels !== undefined || model.reasoning !== undefined) return model
    return { ...cached, ...model }
  })
  writeCached(memoryKey(providerId), merged)
  try {
    const raw = JSON.stringify(decode({ version: 1, models: merged }))
    if (raw.length <= MAX_CACHE_LENGTH) storage?.setItem(modelCacheKey(providerId), raw)
    else storage?.removeItem(modelCacheKey(providerId))
  } catch {
    // Full or blocked storage does not prevent the in-memory catalog updating.
  }
}

/** Credential/configuration changes must not reuse the previous account's list. */
export function invalidateModelCache(providerId: string, storage = browserStorage()): void {
  // Also masks the old disk entry during this run if removal is denied.
  writeCached(memoryKey(providerId), [])
  try { storage?.removeItem(modelCacheKey(providerId)) } catch { /* Storage may be unavailable. */ }
}
