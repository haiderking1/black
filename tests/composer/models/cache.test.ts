import { afterEach, expect, test } from 'bun:test'
import type { ModelInfo } from '../../../contracts/providers'
import { clearResourceCache } from '../../../frontend/rpc/resourceCache'
import { invalidateModelCache, modelCacheKey, readModelCache, writeModelCache, type ModelCacheStorage } from '../../../frontend/composer/models/cache'

const model: ModelInfo = { id: 'model', ownedBy: 'vendor', created: 1, reasoning: true, thinkingKind: 'effort', thinkingLevels: ['low', 'max'] }
function storage(): ModelCacheStorage {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
afterEach(clearResourceCache)

test('restores model IDs and complete thinking metadata after memory is cleared', () => {
  const disk = storage()
  writeModelCache('provider', [model], disk)
  clearResourceCache()
  expect(readModelCache('provider', disk)).toEqual([model])
  expect(readModelCache('other-provider', disk)).toBeUndefined()
})

test('validates stored version, schema, IDs, duplicates and size', () => {
  const disk = storage()
  for (const raw of ['not JSON', JSON.stringify({ version: 2, models: [model] }), JSON.stringify({ version: 1, models: [{}] }), JSON.stringify({ version: 1, models: [{ ...model, thinkingLevels: [5] }] }), JSON.stringify({ version: 1, models: [{ ...model, id: '' }] }), JSON.stringify({ version: 1, models: [model, model] }), ' '.repeat(2 * 1024 * 1024 + 1)]) {
    clearResourceCache()
    disk.setItem(modelCacheKey('provider'), raw)
    expect(readModelCache('provider', disk)).toBeUndefined()
  }
})

test('replaces removed models and explicit capability changes', () => {
  const disk = storage()
  writeModelCache('provider', [model, { ...model, id: 'removed' }], disk)
  writeModelCache('provider', [{ ...model, thinkingKind: 'unknown', thinkingLevels: [] }], disk)
  clearResourceCache()
  expect(readModelCache('provider', disk)).toEqual([{ ...model, thinkingKind: 'unknown', thinkingLevels: [] }])
  writeModelCache('provider', [], disk)
  clearResourceCache()
  expect(readModelCache('provider', disk)).toEqual([])
})

test('retains last-known thinking metadata during a limits-catalog outage', () => {
  const disk = storage()
  writeModelCache('provider', [model], disk)
  writeModelCache('provider', [{ id: model.id, ownedBy: 'updated', created: 2 }], disk)
  clearResourceCache()
  expect(readModelCache('provider', disk)).toEqual([{ ...model, ownedBy: 'updated', created: 2 }])
})

test('invalidating one provider removes its persistent entry without touching another', () => {
  const disk = storage()
  writeModelCache('one', [model], disk)
  writeModelCache('two', [model], disk)
  invalidateModelCache('one', disk)
  expect(readModelCache('one', disk)).toEqual([])
  expect(disk.getItem(modelCacheKey('one'))).toBeNull()
  clearResourceCache()
  expect(readModelCache('one', disk)).toBeUndefined()
  expect(readModelCache('two', disk)).toEqual([model])
})

test('blocked or full storage does not break the in-memory catalog', () => {
  const blocked: ModelCacheStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('blocked') } }
  expect(readModelCache('provider', blocked)).toBeUndefined()
  writeModelCache('provider', [model], blocked)
  expect(readModelCache('provider', blocked)).toEqual([model])
  invalidateModelCache('provider', blocked)
  expect(readModelCache('provider', blocked)).toEqual([])
})

test('persists only the declared model fields', () => {
  const disk = storage()
  writeModelCache('provider', [{ ...model, apiKey: 'not-catalog-data' } as ModelInfo], disk)
  expect(disk.getItem(modelCacheKey('provider'))).not.toContain('not-catalog-data')
})
