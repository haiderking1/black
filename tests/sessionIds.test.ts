import { describe, expect, it } from 'bun:test'
import { assertValidSessionId, generateEntryId, SESSION_ID_PATTERN, uuidv7 } from '../backend/sessions/ids'

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv7', () => {
  it('produces version-7 uuids with valid variant bits', () => {
    for (let i = 0; i < 50; i++) {
      expect(uuidv7()).toMatch(UUID_V7_RE)
    }
  })

  it('is monotonic across ids generated in the same millisecond', () => {
    const ids = Array.from({ length: 100 }, () => uuidv7())
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! >= ids[i - 1]!).toBe(true)
    }
  })

  it('preserves a supplied timestamp for follower ids', () => {
    const id = uuidv7(1700000000000)
    expect(id).toMatch(UUID_V7_RE)
    // 48-bit timestamp occupies the first 12 hex chars (48 bits).
    const top = parseInt(id.slice(0, 8), 16) * 0x10000 + parseInt(id.slice(9, 13), 16)
    expect(top).toBe(1700000000000)
  })

  it('rejects invalid timestamps', () => {
    expect(() => uuidv7(-1)).toThrow(RangeError)
    expect(() => uuidv7(1.5)).toThrow(RangeError)
    expect(() => uuidv7(0xffffffffffff + 1)).toThrow(RangeError)
  })
})

describe('assertValidSessionId', () => {
  it('accepts alphanumeric ids and interior punctuation', () => {
    expect(SESSION_ID_PATTERN.test('abc123')).toBe(true)
    expect(SESSION_ID_PATTERN.test('abc-123_def.456')).toBe(true)
    assertValidSessionId('abc-123_def.456')
  })

  it('rejects ids that start or end with punctuation', () => {
    const invalid = ['', '-abc', 'abc-', '_abc', 'abc_', '.abc', 'abc.', 'abc/def', 'abc def']
    // Length is uncapped: a long alphanumeric id is fine.
    assertValidSessionId('a'.repeat(300))
    for (const id of invalid) {
      expect(SESSION_ID_PATTERN.test(id)).toBe(false)
      expect(() => assertValidSessionId(id)).toThrow()
    }
  })
})

describe('generateEntryId', () => {
  it('avoids collisions with existing ids', () => {
    const byId = new Set<string>(['deadbeef'])
    for (let i = 0; i < 100; i++) {
      const id = generateEntryId(byId)
      expect(byId.has(id)).toBe(false)
      byId.add(id)
    }
  })

  it('falls back to a full uuid under sustained collisions', () => {
    const byId = new Set<string>()
    // Pretend every 8-hex prefix exists by mocking the has() contract.
    const hostile = { has: (id: string) => id.length === 8 }
    const id = generateEntryId(hostile)
    expect(id.length).toBeGreaterThan(8)
    expect(byId.size).toBe(0)
  })
})
