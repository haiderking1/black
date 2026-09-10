import * as Diff from 'diff'

/**
 * Turning a changed file into something a person can read.
 *
 * The patch is the standard format and exists for anything that wants to apply
 * or store the change. The display diff is the one rendered in the transcript,
 * and it is line numbered with gaps between distant changes so a two line edit
 * in a large file does not paste the whole file into the conversation.
 */

export function generateUnifiedPatch(
  path: string,
  oldContent: string,
  newContent: string,
  contextLines = 4
): string {
  return Diff.createTwoFilesPatch(path, path, oldContent, newContent, undefined, undefined, {
    context: contextLines,
    headerOptions: Diff.FILE_HEADERS_ONLY
  })
}

export function generateDiffString(
  oldContent: string,
  newContent: string,
  contextLines = 4
): { diff: string; firstChangedLine: number | undefined } {
  const parts = Diff.diffLines(oldContent, newContent)
  const output: string[] = []

  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const maxLineNum = Math.max(oldLines.length, newLines.length)
  const lineNumWidth = String(maxLineNum).length

  let oldLineNum = 1
  let newLineNum = 1
  let firstChangedLine: number | undefined

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]
    if (part === undefined) {
      continue
    }
    const raw = part.value.split('\n')
    if (raw[raw.length - 1] === '') {
      raw.pop()
    }

    if (part.added || part.removed) {
      // Recorded for a removal as well as an addition. A pure deletion changed
      // the file at this line, and leaving this undefined tells the reader
      // nothing about where the change landed.
      if (firstChangedLine === undefined) {
        firstChangedLine = newLineNum
      }

      for (const line of raw) {
        if (part.added) {
          output.push('+' + String(newLineNum).padStart(lineNumWidth, ' ') + ' ' + line)
          newLineNum++
        } else {
          output.push('-' + String(oldLineNum).padStart(lineNumWidth, ' ') + ' ' + line)
          oldLineNum++
        }
      }
      continue
    }

    // A block of unchanged lines. Near a change it is shown as context; between
    // two distant changes the middle is dropped so the output stays readable.
    const previous = parts[index - 1]
    const next = parts[index + 1]
    const hasLeadingChange =
      previous !== undefined && (previous.added === true || previous.removed === true)
    const hasTrailingChange = next !== undefined && (next.added === true || next.removed === true)

    if (hasLeadingChange && hasTrailingChange) {
      if (raw.length <= contextLines * 2) {
        for (const line of raw) {
          output.push(' ' + String(oldLineNum).padStart(lineNumWidth, ' ') + ' ' + line)
          oldLineNum++
          newLineNum++
        }
      } else {
        const leading = raw.slice(0, contextLines)
        const trailing = raw.slice(raw.length - contextLines)
        const skipped = raw.length - leading.length - trailing.length

        for (const line of leading) {
          output.push(' ' + String(oldLineNum).padStart(lineNumWidth, ' ') + ' ' + line)
          oldLineNum++
          newLineNum++
        }

        output.push(' ' + ''.padStart(lineNumWidth, ' ') + ' ...')
        oldLineNum += skipped
        newLineNum += skipped

        for (const line of trailing) {
          output.push(' ' + String(oldLineNum).padStart(lineNumWidth, ' ') + ' ' + line)
          oldLineNum++
          newLineNum++
        }
      }
    } else if (hasLeadingChange) {
      const shown = raw.slice(0, contextLines)
      const skipped = raw.length - shown.length

      for (const line of shown) {
        output.push(' ' + String(oldLineNum).padStart(lineNumWidth, ' ') + ' ' + line)
        oldLineNum++
        newLineNum++
      }

      if (skipped > 0) {
        output.push(' ' + ''.padStart(lineNumWidth, ' ') + ' ...')
        oldLineNum += skipped
        newLineNum += skipped
      }
    } else if (hasTrailingChange) {
      const skipped = Math.max(0, raw.length - contextLines)
      if (skipped > 0) {
        output.push(' ' + ''.padStart(lineNumWidth, ' ') + ' ...')
        oldLineNum += skipped
        newLineNum += skipped
      }

      for (const line of raw.slice(skipped)) {
        output.push(' ' + String(oldLineNum).padStart(lineNumWidth, ' ') + ' ' + line)
        oldLineNum++
        newLineNum++
      }
    } else {
      // Far from any change, so counted through without printing.
      oldLineNum += raw.length
      newLineNum += raw.length
    }
  }

  return { diff: output.join('\n'), firstChangedLine }
}
