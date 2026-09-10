import { describe, expect, it } from 'bun:test'

import { createTtlCache } from '../backend/providers/cache'

describe('createTtlCache', () => {
  it('loads once and serves from cache within the ttl', async () => {
    let loads = 0
    const cache = createTtlCache(async () => {
      loads++
      return loads
    }, { ttlMs: 1000, now: () => 0 })

    expect(await cache.get()).toBe(1)
    expect(await cache.get()).toBe(1)
    expect(loads).toBe(1)
  })

  it('reloads once the ttl has passed', async () => {
    let loads = 0
    let clock = 0
    const cache = createTtlCache(async () => ++loads, { ttlMs: 100, now: () => clock })

    expect(await cache.get()).toBe(1)
    clock = 99
    expect(await cache.get()).toBe(1)
    clock = 100
    expect(await cache.get()).toBe(2)
  })

  it('shares one in-flight load between concurrent callers', async () => {
    let loads = 0
    // Held on an object so the closure assignment does not fight narrowing.
    const gate: { release: () => void } = { release: () => {} }
    const cache = createTtlCache(async () => {
      loads++
      await new Promise<void>((resolve) => {
        gate.release = resolve
      })
      return 'value'
    }, { ttlMs: 1000, now: () => 0 })

    const first = cache.get()
    const second = cache.get()
    gate.release()
    expect(await Promise.all([first, second])).toEqual(['value', 'value'])
    expect(loads).toBe(1)
  })

  it('does not cache a failure, so the next caller retries', async () => {
    let loads = 0
    const cache = createTtlCache(async () => {
      loads++
      if (loads === 1) throw new Error('transient')
      return 'recovered'
    }, { ttlMs: 1000, now: () => 0 })

    await expect(cache.get()).rejects.toThrow('transient')
    expect(await cache.get()).toBe('recovered')
    expect(loads).toBe(2)
  })

  it('peek returns nothing when stale or absent, and invalidate clears', async () => {
    let clock = 0
    const cache = createTtlCache(async () => 'value', { ttlMs: 100, now: () => clock })

    expect(cache.peek()).toBe(undefined)
    await cache.get()
    expect(cache.peek()).toBe('value')
    clock = 100
    expect(cache.peek()).toBe(undefined)

    cache.invalidate()
    expect(cache.peek()).toBe(undefined)
  })

  it('refresh bypasses a fresh cache entry', async () => {
    let loads = 0
    const cache = createTtlCache(async () => ++loads, { ttlMs: 10_000, now: () => 0 })

    expect(await cache.get()).toBe(1)
    expect(await cache.refresh()).toBe(2)
    expect(await cache.get()).toBe(2)
  })
})
