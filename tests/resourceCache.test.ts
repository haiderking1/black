import { afterEach, describe, expect, it } from 'bun:test'

import {
  clearResourceCache,
  hasCached,
  readCached,
  writeCached,
} from '../frontend/rpc/resourceCache'

afterEach(() => {
  // Module state, so a value left behind would leak into the next test.
  clearResourceCache()
})

describe('the resource cache', () => {
  it('reads back what was written', () => {
    writeCached('providers.list', ['a', 'b'])
    expect(readCached<string[]>('providers.list')).toEqual(['a', 'b'])
  })

  it('returns undefined for a key nothing has read', () => {
    expect(readCached('never')).toBeUndefined()
    expect(hasCached('never')).toBe(false)
  })

  it('tells an empty answer apart from no answer', () => {
    // This is the distinction the whole thing rests on: a screen that has read
    // an empty list must not look the same as one that has never read at all,
    // or it shows a loading state forever.
    writeCached('models', [])
    // The type argument is not optional here: with no argument to infer from,
    // readCached resolves T to unknown and the matcher refuses the comparison.
    expect(readCached<unknown[]>('models')).toEqual([])
    expect(hasCached('models')).toBe(true)
    expect(hasCached('other')).toBe(false)
  })

  it('keeps keys apart', () => {
    writeCached('models:go', ['go'])
    writeCached('models:zen', ['zen'])
    expect(readCached<string[]>('models:go')).toEqual(['go'])
    expect(readCached<string[]>('models:zen')).toEqual(['zen'])
  })

  it('keeps only the most recent value', () => {
    writeCached('x', 'first')
    writeCached('x', 'second')
    expect(readCached<string>('x')).toBe('second')
  })

  it('forgets everything when cleared', () => {
    writeCached('a', 1)
    writeCached('b', 2)
    clearResourceCache()
    expect(hasCached('a')).toBe(false)
    expect(hasCached('b')).toBe(false)
  })
})
