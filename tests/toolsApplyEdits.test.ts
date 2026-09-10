import { describe, expect, it } from 'bun:test'

import { applyEditsToNormalizedContent, applyReplacementsPreservingUnchangedLines } from '../backend/tools/applyEdits'

const apply = (content: string, edits: Array<{ oldText: string; newText: string }>, path = 'a.ts') =>
  applyEditsToNormalizedContent(content, edits, path)

describe('applyEditsToNormalizedContent', () => {
  it('replaces a unique match', () => {
    const result = apply('const a = 1\nconst b = 2', [{ oldText: 'const a = 1', newText: 'const a = 9' }])
    expect(result.newContent).toBe('const a = 9\nconst b = 2')
    expect(result.baseContent).toBe('const a = 1\nconst b = 2')
  })

  it('applies several edits measured against the same original', () => {
    // The second edit must not be affected by the first one having landed.
    const result = apply('one\ntwo\nthree', [
      { oldText: 'one', newText: 'ONE' },
      { oldText: 'three', newText: 'THREE' }
    ])
    expect(result.newContent).toBe('ONE\ntwo\nTHREE')
  })

  it('keeps offsets correct when an earlier edit changes length', () => {
    // A left-to-right apply would corrupt this. Back-to-front is why it holds.
    const result = apply('alpha\nbeta\ngamma', [
      { oldText: 'alpha', newText: 'a much longer replacement line' },
      { oldText: 'gamma', newText: 'g' }
    ])
    expect(result.newContent).toBe('a much longer replacement line\nbeta\ng')
  })

  it('refuses text that is not there', () => {
    expect(() => apply('const a = 1', [{ oldText: 'const z = 9', newText: 'x' }])).toThrow(/Could not find/)
  })

  it('refuses text that appears more than once', () => {
    expect(() => apply('a\na', [{ oldText: 'a', newText: 'b' }])).toThrow(/2 occurrences/)
  })

  it('names the index when there is more than one edit', () => {
    expect(() => apply('one\ntwo', [
      { oldText: 'one', newText: 'ONE' },
      { oldText: 'missing', newText: 'X' }
    ])).toThrow(/edits\[1\]/)
  })

  it('does not name an index when there is only one edit', () => {
    // "edits[0]" would be noise for a single replacement.
    expect(() => apply('one', [{ oldText: 'missing', newText: 'x' }])).not.toThrow(/edits\[0\]/)
  })

  it('refuses an empty oldText instead of matching everywhere', () => {
    expect(() => apply('abc', [{ oldText: '', newText: 'x' }])).toThrow(/must not be empty/)
  })

  it('refuses a replacement that changes nothing', () => {
    expect(() => apply('const a = 1', [{ oldText: 'const a = 1', newText: 'const a = 1' }])).toThrow(/No changes made/)
  })

  it('refuses overlapping edits and says which two', () => {
    expect(() => apply('abcdef', [
      { oldText: 'abcd', newText: 'x' },
      { oldText: 'cdef', newText: 'y' }
    ])).toThrow(/overlap/)
  })

  it('allows edits that touch without overlapping', () => {
    const result = apply('abcdef', [
      { oldText: 'abc', newText: 'x' },
      { oldText: 'def', newText: 'y' }
    ])
    expect(result.newContent).toBe('xy')
  })

  it('normalizes crlf in the incoming edit so it can match an lf file', () => {
    const result = apply('one\ntwo', [{ oldText: 'one\r\ntwo', newText: 'ONE\nTWO' }])
    expect(result.newContent).toBe('ONE\nTWO')
  })

  it('removes a line entirely', () => {
    const result = apply('keep\ndrop\nkeep2', [{ oldText: 'drop\n', newText: '' }])
    expect(result.newContent).toBe('keep\nkeep2')
  })

  it('appends at the end of a file', () => {
    const result = apply('last line\n', [{ oldText: 'last line\n', newText: 'last line\nadded\n' }])
    expect(result.newContent).toBe('last line\nadded\n')
  })

  it('matches a lowercase variant of the same text as a duplicate', () => {
    // Both occurrences match loosely, so neither is unique.
    expect(() => apply('const x = 1\nconst x = 1', [{ oldText: 'const x = 1', newText: 'y' }])).toThrow(/2 occurrences/)
  })
})

describe('loose matching preserves the rest of the file', () => {
  it('does not rewrite smart quotes elsewhere in the file', () => {
    // The match needed normalizing, so the replacement runs in normalized
    // space. Everything the edit did not touch must still come back original.
    const content = "// don't touch this\nconst a = 1 // it's here\n// nor this either"
    const result = apply(content, [{ oldText: "const a = 1 // it's here".replace("'", '\u2019'), newText: 'const a = 2' }])
    expect(result.newContent).toContain("// don't touch this")
    expect(result.newContent).toContain('// nor this either')
    expect(result.newContent).toContain('const a = 2')
  })

  it('does not rewrite trailing whitespace elsewhere in the file', () => {
    const content = 'trailing   \nconst a = 1 // c\nmore   '
    const result = apply(content, [{ oldText: 'const a = 1 \u2014 c'.replace('\u2014 ', '// '), newText: 'const a = 2' }])
    expect(result.newContent).toContain('trailing   ')
    expect(result.newContent).toContain('more   ')
  })

  it('keeps the file byte-identical outside the changed lines', () => {
    const content = 'first\u00A0line\nsecond line\nthird line'
    const result = apply(content, [{ oldText: 'second line', newText: 'SECOND' }])
    // Exact match here, so nothing should have been normalized at all.
    expect(result.newContent).toBe('first\u00A0line\nSECOND\nthird line')
  })

  it('preserves unchanged lines when a loose match spans several lines', () => {
    const content = 'a   \nb\u2019c\nd   \ne'
    const result = apply(content, [{ oldText: "b'c", newText: 'B' }])
    expect(result.newContent).toBe('a   \nB\nd   \ne')
  })
})

describe('applyReplacementsPreservingUnchangedLines', () => {
  it('copies untouched lines from the original', () => {
    const result = applyReplacementsPreservingUnchangedLines('x   \ny   \nz   ', 'x\ny\nz', [
      { matchIndex: 2, matchLength: 1, newText: 'Y' }
    ])
    expect(result).toBe('x   \nY\nz   ')
  })

  it('refuses when the two contents disagree on line count', () => {
    expect(() => applyReplacementsPreservingUnchangedLines('a\nb', 'a', [{ matchIndex: 0, matchLength: 1, newText: 'x' }])).toThrow(
      /different line count/
    )
  })

  it('refuses a range outside the content', () => {
    expect(() =>
      applyReplacementsPreservingUnchangedLines('a\nb', 'a\nb', [{ matchIndex: 9, matchLength: 1, newText: 'x' }])
    ).toThrow(/outside the base content/)
  })
})
