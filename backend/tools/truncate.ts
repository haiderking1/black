/**
 * Cutting a tool result down to something a model can actually receive.
 *
 * Two limits, whichever lands first. A file with short lines hits the line
 * limit; a file with three enormous lines hits the byte limit. Both exist
 * because either one alone lets a pathological file through.
 *
 * A partial line is never returned. Half a line of code is worse than no line:
 * the model reads it as the real thing and edits against it.
 */

export const DEFAULT_MAX_LINES = 2000
export const DEFAULT_MAX_BYTES = 50 * 1024

export interface TruncationResult {
  content: string
  truncated: boolean
  truncatedBy: 'lines' | 'bytes' | null
  totalLines: number
  totalBytes: number
  outputLines: number
  outputBytes: number
  firstLineExceedsLimit: boolean
  maxLines: number
  maxBytes: number
}

export interface TruncationOptions {
  maxLines?: number
  maxBytes?: number
}

/** A trailing newline terminates the last line, it does not start an empty one. */
function splitLinesForCounting(content: string): string[] {
  if (content.length === 0) {
    return []
  }
  const lines = content.split('\n')
  if (content.endsWith('\n')) {
    lines.pop()
  }
  return lines
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return bytes + 'B'
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + 'KB'
  }
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

export function truncateHead(content: string, options: TruncationOptions = {}): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const totalBytes = Buffer.byteLength(content, 'utf-8')
  const lines = splitLinesForCounting(content)
  const totalLines = lines.length

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes
    }
  }

  // A single line over the byte limit cannot be cut down to a whole line at
  // all, so there is nothing honest to return. The caller reports the size
  // rather than a fragment.
  const firstLineBytes = Buffer.byteLength(lines[0] ?? '', 'utf-8')
  if (firstLineBytes > maxBytes) {
    return {
      content: '',
      truncated: true,
      truncatedBy: 'bytes',
      totalLines,
      totalBytes,
      outputLines: 0,
      outputBytes: 0,
      firstLineExceedsLimit: true,
      maxLines,
      maxBytes
    }
  }

  const kept: string[] = []
  let keptBytes = 0
  let truncatedBy: 'lines' | 'bytes' = 'lines'

  for (let index = 0; index < lines.length && index < maxLines; index++) {
    // The newline separating this line from the previous one counts, but the
    // first line has no separator in front of it.
    const line = lines[index]
    if (line === undefined) {
      break
    }
    const lineBytes = Buffer.byteLength(line, 'utf-8') + (index > 0 ? 1 : 0)
    if (keptBytes + lineBytes > maxBytes) {
      truncatedBy = 'bytes'
      break
    }
    kept.push(line)
    keptBytes += lineBytes
  }

  if (kept.length >= maxLines && keptBytes <= maxBytes) {
    truncatedBy = 'lines'
  }

  const output = kept.join('\n')
  return {
    content: output,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: kept.length,
    outputBytes: Buffer.byteLength(output, 'utf-8'),
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes
  }
}
