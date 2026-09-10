/**
 * Matching the text a model sent against the text that is actually in the file.
 *
 * Models retype code rather than copying it, so what arrives routinely differs
 * from the file in ways nobody can see: a typographic apostrophe in a comment,
 * an en dash in a range, a non-breaking space, trailing whitespace that was
 * stripped somewhere along the way.
 *
 * Exact match is tried first and is the common case. Falling back to a
 * normalized comparison means those invisible differences stop being a failed
 * edit. The normalized form is only ever used to locate a match, never written
 * back, so none of these substitutions reach the file.
 */

export interface FuzzyMatch {
  found: boolean
  index: number
  matchLength: number
  usedFuzzyMatch: boolean
  contentForReplacement: string
}

export function normalizeForFuzzyMatch(text: string): string {
  return (
    text
      .normalize('NFKC')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, ' ')
  )
}

export function fuzzyFindText(content: string, oldText: string): FuzzyMatch {
  const exactIndex = content.indexOf(oldText)
  if (exactIndex !== -1) {
    return {
      found: true,
      index: exactIndex,
      matchLength: oldText.length,
      usedFuzzyMatch: false,
      contentForReplacement: content
    }
  }

  // Work entirely in normalized space. Offsets returned are offsets into the
  // normalized content, so callers must apply them against that string.
  const normalizedContent = normalizeForFuzzyMatch(content)
  const normalizedOldText = normalizeForFuzzyMatch(oldText)
  const fuzzyIndex = normalizedContent.indexOf(normalizedOldText)

  if (fuzzyIndex === -1) {
    return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false, contentForReplacement: content }
  }

  return {
    found: true,
    index: fuzzyIndex,
    matchLength: normalizedOldText.length,
    usedFuzzyMatch: true,
    contentForReplacement: normalizedContent
  }
}

/**
 * How many times this text appears, counted in normalized space.
 *
 * Counted the same way it was matched. Counting exact occurrences while
 * matching loosely would let a second match through unnoticed, and then replace
 * whichever one happened to come first.
 */
export function countOccurrences(content: string, oldText: string): number {
  const normalizedContent = normalizeForFuzzyMatch(content)
  const normalizedOldText = normalizeForFuzzyMatch(oldText)
  if (normalizedOldText.length === 0) {
    return 0
  }
  return normalizedContent.split(normalizedOldText).length - 1
}
