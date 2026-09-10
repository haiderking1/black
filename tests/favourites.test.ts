import { describe, expect, it } from 'bun:test'

import {
  loadFavourites,
  parseFavourites,
  saveFavourites,
  toggleFavourite,
  type KeyValueStore,
} from '../frontend/composer/favourites'

function fakeStore(seed: Record<string, string> = {}): KeyValueStore {
  const values = new Map(Object.entries(seed))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('parseFavourites', () => {
  it('reads a stored list', () => {
    expect(parseFavourites('["a","b"]')).toEqual(['a', 'b'])
  })

  it('treats nothing stored as nothing favourited', () => {
    expect(parseFavourites(null)).toEqual([])
  })

  it('survives a value that is not a list', () => {
    expect(parseFavourites('{"a":1}')).toEqual([])
    expect(parseFavourites('"a"')).toEqual([])
    expect(parseFavourites('null')).toEqual([])
  })

  it('survives a half written value', () => {
    expect(parseFavourites('["a",')).toEqual([])
  })

  it('drops entries that are not strings', () => {
    // A hand edited store must not put a number where an id belongs.
    expect(parseFavourites('["a",1,null,{"b":2},"c"]')).toEqual(['a', 'c'])
  })
})

describe('loadFavourites and saveFavourites', () => {
  it('round trips through a store', () => {
    const store = fakeStore()
    saveFavourites(['glm-5.3'], store)
    expect(loadFavourites(store)).toEqual(['glm-5.3'])
  })

  it('reads nothing from an empty store', () => {
    expect(loadFavourites(fakeStore())).toEqual([])
  })

  it('does nothing without a store rather than throwing', () => {
    expect(loadFavourites(null)).toEqual([])
    expect(() => saveFavourites(['a'], null)).not.toThrow()
  })

  it('survives a store that refuses to write', () => {
    const hostile: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    expect(() => saveFavourites(['a'], hostile)).not.toThrow()
  })
})

describe('toggleFavourite', () => {
  it('adds an id that is not there', () => {
    expect(toggleFavourite([], 'a')).toEqual(['a'])
    expect(toggleFavourite(['b'], 'a')).toEqual(['b', 'a'])
  })

  it('removes an id that is', () => {
    expect(toggleFavourite(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('does not mutate the input', () => {
    const original = ['a']
    toggleFavourite(original, 'b')
    expect(original).toEqual(['a'])
  })
})
