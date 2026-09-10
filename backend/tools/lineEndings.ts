/**
 * Text a file says it is, against text a model thinks it is.
 *
 * A model reading "line one\nline two" has no idea whether the file uses CRLF,
 * and it will never include a byte order mark in the text it asks to replace,
 * because it cannot see one. Both have to survive an edit untouched, or every
 * change rewrites the line endings of the whole file.
 */

/** Split a leading byte order mark off decoded text. */
export function splitBom(content: string): { bom: string; text: string } {
  return content.startsWith('\uFEFF') ? { bom: '\uFEFF', text: content.slice(1) } : { bom: '', text: content }
}

/**
 * Read the dominant line ending rather than assuming one.
 *
 * Whichever comes first wins. A file with a CRLF at the top and lone newlines
 * further down is a CRLF file that has been edited, and rewriting it as LF
 * would produce a diff touching every line.
 */
export function detectLineEnding(content: string): '\r\n' | '\n' {
  const crlfIndex = content.indexOf('\r\n')
  const lfIndex = content.indexOf('\n')
  if (lfIndex === -1 || crlfIndex === -1) {
    return '\n'
  }
  return crlfIndex < lfIndex ? '\r\n' : '\n'
}

export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function restoreLineEndings(text: string, ending: '\r\n' | '\n'): string {
  return ending === '\r\n' ? text.replace(/\n/g, '\r\n') : text
}
