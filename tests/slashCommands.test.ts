import { describe, expect, it } from 'bun:test'

import {
  SLASH_COMMANDS,
  commandFor,
  isCommandQuery,
  matchCommands,
} from '../frontend/composer/slashCommands'

describe('isCommandQuery', () => {
  it('is true for a bare slash', () => {
    expect(isCommandQuery('/')).toBe(true)
    expect(isCommandQuery('/com')).toBe(true)
  })

  it('is false for an ordinary message', () => {
    expect(isCommandQuery('hello')).toBe(false)
    expect(isCommandQuery('')).toBe(false)
    expect(isCommandQuery(' see /compact')).toBe(false)
  })

  it('is false once a newline has been typed, since that is no longer one line', () => {
    expect(isCommandQuery('/compact\nmore')).toBe(false)
  })

  it('does not open on a slash inside a sentence', () => {
    // A path or a date is far more common than a command mid-sentence.
    expect(isCommandQuery('look at src/and/then')).toBe(false)
  })
})

describe('matchCommands', () => {
  it('offers everything for a bare slash', () => {
    expect(matchCommands('/')).toHaveLength(SLASH_COMMANDS.length)
  })

  it('narrows as more is typed', () => {
    expect(matchCommands('/com').map((c) => c.name)).toEqual(['/compact'])
    expect(matchCommands('/c').map((c) => c.name)).toEqual(['/compact'])
  })

  it('ignores case', () => {
    expect(matchCommands('/COM').map((c) => c.name)).toEqual(['/compact'])
  })

  it('returns nothing once nothing matches, rather than everything', () => {
    expect(matchCommands('/zzz')).toEqual([])
  })

  it('returns nothing for an ordinary message', () => {
    expect(matchCommands('hello')).toEqual([])
  })
})

describe('commandFor', () => {
  it('finds the command an input names', () => {
    expect(commandFor('/compact')?.name).toBe('/compact')
    expect(commandFor('  /compact  ')?.name).toBe('/compact')
    expect(commandFor('/COMPACT')?.name).toBe('/compact')
  })

  it('is null for anything else, including a near miss', () => {
    expect(commandFor('hello')).toBeNull()
    expect(commandFor('/compac')).toBeNull()
    expect(commandFor('/compact now')).toBeNull()
  })
})

describe('the command list', () => {
  it('names every command with a leading slash', () => {
    for (const command of SLASH_COMMANDS) {
      expect(command.name.startsWith('/')).toBe(true)
    }
  })

  it('describes every command', () => {
    for (const command of SLASH_COMMANDS) {
      expect(command.description.length).toBeGreaterThan(0)
    }
  })
})
