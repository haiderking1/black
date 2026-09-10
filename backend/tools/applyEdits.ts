import { countOccurrences, fuzzyFindText, normalizeForFuzzyMatch } from './fuzzyMatch'
import { normalizeToLF } from './lineEndings'

/**
 * Applying replacements, which is where an edit tool is actually right or wrong.
 *
 * Two things make this harder than a string replace.
 *
 * Every edit is matched against the same original text rather than each against
 * the result of the last, so a model can describe three unrelated changes in one
 * call without tracking its own arithmetic. That means replacements are applied
 * back to front, from the end of the file, so earlier offsets stay valid.
 *
 * And when a match was found loosely, the offsets describe the normalized text,
 * not the file. Writing normalized text back would quietly rewrite every smart
 * quote and trailing space in the region. So a loose match is widened to the
 * lines it actually touches, only those lines are rebuilt from the normalized
 * copy, and every untouched line is copied back from the original byte for
 * byte.
 */

export interface Edit {
  oldText: string
  newText: string
}

export interface AppliedEdits {
  baseContent: string
  newContent: string
}

interface LineSpan {
  start: number
  end: number
}

interface MatchedEdit {
  editIndex: number
  matchIndex: number
  matchLength: number
  newText: string
}

type TextReplacement = Pick<MatchedEdit, 'matchIndex' | 'matchLength' | 'newText'>

/**
 * Describe a mismatch in terms the model can act on.
 *
 * These come back as the tool result, so the model reads them on its next turn
 * and tries again. Naming which edit failed and why is the difference between a
 * corrected retry and the same call repeated verbatim.
 *
 * With a single edit there is no index worth naming; with several, the index is
 * the only thing that says which one to fix.
 */
function subject(editIndex: number, total: number): string {
  return total === 1 ? 'the exact text' : `edits[${editIndex}]`
}

function notFoundError(path: string, editIndex: number, total: number): Error {
  return new Error(
    `Could not find ${subject(editIndex, total)} in ${path}. It must match exactly, including all whitespace and newlines. Read the file again and copy the text from what you read.`
  )
}

function duplicateError(path: string, editIndex: number, total: number, occurrences: number): Error {
  return new Error(
    `Found ${occurrences} occurrences of ${subject(editIndex, total)} in ${path}. Each edit must match exactly once, so include more surrounding context to make it unique.`
  )
}

function emptyOldTextError(path: string, editIndex: number, total: number): Error {
  return new Error(`oldText for ${subject(editIndex, total)} must not be empty in ${path}.`)
}

function noChangeError(path: string, total: number): Error {
  const verb = total === 1 ? 'The replacement produced' : 'The replacements produced'
  return new Error(
    `No changes made to ${path}. ${verb} identical content, which usually means the text did not match what was expected.`
  )
}

/** A file's lines with their terminators still attached, so joining is lossless. */
function splitLinesWithEndings(content: string): string[] {
  return content.match(/[^\n]*\n|[^\n]+/g) ?? []
}

function getLineSpans(content: string): LineSpan[] {
  let offset = 0
  return splitLinesWithEndings(content).map((line) => {
    const span = { start: offset, end: offset + line.length }
    offset = span.end
    return span
  })
}

/**
 * Widen a replacement to the whole lines it touches.
 *
 * Line granularity is what makes the overlay safe. Part of a line cannot be
 * copied from the original and part from the normalized copy without inventing
 * a boundary neither of them has.
 */
function getReplacementLineRange(lines: LineSpan[], replacement: TextReplacement): { startLine: number; endLine: number } {
  const replacementStart = replacement.matchIndex
  const replacementEnd = replacement.matchIndex + replacement.matchLength

  let startLine = -1
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line !== undefined && replacementStart >= line.start && replacementStart < line.end) {
      startLine = index
      break
    }
  }
  if (startLine === -1) {
    throw new Error('Replacement range is outside the base content.')
  }

  let endLine = startLine
  while (endLine < lines.length && (lines[endLine]?.end ?? 0) < replacementEnd) {
    endLine++
  }
  if (endLine >= lines.length) {
    throw new Error('Replacement range is outside the base content.')
  }

  return { startLine, endLine: endLine + 1 }
}

/** Apply in reverse so each replacement is measured against the same original. */
function applyReplacements(content: string, replacements: TextReplacement[], offset = 0): string {
  let result = content
  for (let index = replacements.length - 1; index >= 0; index--) {
    const replacement = replacements[index]
    if (replacement === undefined) {
      continue
    }
    const matchIndex = replacement.matchIndex - offset
    result =
      result.substring(0, matchIndex) + replacement.newText + result.substring(matchIndex + replacement.matchLength)
  }
  return result
}

export function applyReplacementsPreservingUnchangedLines(
  originalContent: string,
  baseContent: string,
  replacements: TextReplacement[]
): string {
  const originalLines = splitLinesWithEndings(originalContent)
  const baseLines = getLineSpans(baseContent)

  if (originalLines.length !== baseLines.length) {
    throw new Error('Cannot preserve unchanged lines because the base content has a different line count.')
  }

  // Group replacements that touch the same or adjacent lines, so each group can
  // be rebuilt from the normalized copy in one pass.
  const groups: Array<{ startLine: number; endLine: number; replacements: TextReplacement[] }> = []
  const sorted = [...replacements].sort((left, right) => left.matchIndex - right.matchIndex)
  for (const replacement of sorted) {
    const range = getReplacementLineRange(baseLines, replacement)
    const current = groups[groups.length - 1]
    if (current !== undefined && range.startLine < current.endLine) {
      current.endLine = Math.max(current.endLine, range.endLine)
      current.replacements.push(replacement)
      continue
    }
    groups.push({ ...range, replacements: [replacement] })
  }

  let originalLineIndex = 0
  let result = ''
  for (const group of groups) {
    result += originalLines.slice(originalLineIndex, group.startLine).join('')

    const groupStart = baseLines[group.startLine]
    const groupEnd = baseLines[group.endLine - 1]
    if (groupStart === undefined || groupEnd === undefined) {
      throw new Error('Replacement range is outside the base content.')
    }
    result += applyReplacements(baseContent.slice(groupStart.start, groupEnd.end), group.replacements, groupStart.start)
    originalLineIndex = group.endLine
  }
  result += originalLines.slice(originalLineIndex).join('')

  return result
}

/**
 * Apply one or more replacements to LF-normalized content.
 *
 * Matching happens against the original text for every edit, never against the
 * running result, and every edit must match exactly once.
 */
export function applyEditsToNormalizedContent(normalizedContent: string, edits: Edit[], path: string): AppliedEdits {
  const normalizedEdits = edits.map((edit) => ({
    oldText: normalizeToLF(edit.oldText),
    newText: normalizeToLF(edit.newText)
  }))

  for (let index = 0; index < normalizedEdits.length; index++) {
    const edit = normalizedEdits[index]
    if (edit !== undefined && edit.oldText.length === 0) {
      throw emptyOldTextError(path, index, normalizedEdits.length)
    }
  }

  // One loose match anywhere means every edit is located in normalized space,
  // so the offsets all come from the same string and cannot disagree.
  const loose = normalizedEdits.some((edit) => fuzzyFindText(normalizedContent, edit.oldText).usedFuzzyMatch)
  const replacementBase = loose ? normalizeForFuzzyMatch(normalizedContent) : normalizedContent

  const matched: MatchedEdit[] = []
  for (let index = 0; index < normalizedEdits.length; index++) {
    const edit = normalizedEdits[index]
    if (edit === undefined) {
      continue
    }

    const match = fuzzyFindText(replacementBase, edit.oldText)
    if (!match.found) {
      throw notFoundError(path, index, normalizedEdits.length)
    }

    const occurrences = countOccurrences(replacementBase, edit.oldText)
    if (occurrences > 1) {
      throw duplicateError(path, index, normalizedEdits.length, occurrences)
    }

    matched.push({
      editIndex: index,
      matchIndex: match.index,
      matchLength: match.matchLength,
      newText: edit.newText
    })
  }

  matched.sort((left, right) => left.matchIndex - right.matchIndex)
  for (let index = 1; index < matched.length; index++) {
    const previous = matched[index - 1]
    const current = matched[index]
    if (previous === undefined || current === undefined) {
      continue
    }
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new Error(
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${path}. Merge them into one edit or target separate regions.`
      )
    }
  }

  const newContent = loose
    ? applyReplacementsPreservingUnchangedLines(normalizedContent, replacementBase, matched)
    : applyReplacements(replacementBase, matched)

  if (normalizedContent === newContent) {
    throw noChangeError(path, normalizedEdits.length)
  }

  return { baseContent: normalizedContent, newContent }
}
