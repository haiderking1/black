import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'

import { detectImageMimeTypeFromFile, processImage } from './image'
import { resolveReadPath } from './paths'
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from './truncate'
import type { Tool, ToolContext, ToolOutcome } from './types'

/**
 * Reading a file, including the part where the file is too big to read.
 *
 * A model cannot receive a hundred thousand line file, so the interesting work
 * here is not reading. It is telling the model exactly which lines it got and
 * what number to pass next, so it can walk a large file in a few calls instead
 * of giving up and guessing at the contents.
 */

function requireNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(field + ' must be a number.')
  }
  return value
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(field + ' is required and must be a non-empty string.')
  }
  return value
}

/** Distinguish the reasons a read fails, because the model acts on each differently. */
function describeFileError(error: unknown, path: string): Error {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ENOENT') {
    return new Error('Could not read ' + path + '. No such file or directory.')
  }
  if (code === 'EISDIR') {
    return new Error('Could not read ' + path + '. It is a directory, not a file.')
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new Error('Could not read ' + path + '. Permission denied.')
  }
  if (code === 'ELOOP') {
    return new Error('Could not read ' + path + '. Too many levels of symbolic links.')
  }
  return new Error('Could not read ' + path + '. ' + (error instanceof Error ? error.message : String(error)))
}

/**
 * Decode an image and hand it back for the model to look at.
 *
 * Two things can still stop the image reaching the model, and both are reported
 * rather than silent. A format that cannot be decoded or shrunk below the
 * request limit becomes a sentence saying so. A model that cannot be shown
 * images is told the file is an image and not sent its bytes, because sending
 * them fails the whole request rather than that one read.
 */
async function readImage(
  absolutePath: string,
  mimeType: string,
  requested: string,
  context: ToolContext
): Promise<ToolOutcome> {
  let bytes: Buffer
  try {
    bytes = await readFile(absolutePath)
  } catch (error) {
    throw describeFileError(error, requested)
  }

  const processed = await processImage(bytes, mimeType)
  if (!processed.ok) {
    return {
      content: 'Read image file [' + mimeType + ']. ' + processed.message,
      details: { path: absolutePath, mimeType }
    }
  }

  const lines = ['Read image file [' + processed.mimeType + ']', ...processed.hints]

  if (context.acceptsImages === false) {
    lines.push('[The current model cannot be shown images, so the image itself was not sent. Report this rather than guessing at what it contains.]')
    return {
      content: lines.join('\n'),
      details: { path: absolutePath, mimeType: processed.mimeType, omitted: true }
    }
  }

  return {
    content: lines.join('\n'),
    images: [{ data: processed.data, mimeType: processed.mimeType }],
    details: { path: absolutePath, mimeType: processed.mimeType }
  }
}

async function runRead(input: unknown, context: ToolContext): Promise<ToolOutcome> {
  const args = (input ?? {}) as Record<string, unknown>
  const requested = requireString(args.path, 'path')
  const offset = requireNumber(args.offset, 'offset')
  const limit = requireNumber(args.limit, 'limit')

  if (offset !== undefined && offset < 1) {
    throw new Error('offset must be 1 or greater, since the first line is line 1.')
  }
  if (limit !== undefined && limit < 1) {
    throw new Error('limit must be 1 or greater.')
  }

  const absolutePath = await resolveReadPath(requested, context.cwd)

  try {
    await access(absolutePath, constants.R_OK)
  } catch (error) {
    throw describeFileError(error, requested)
  }

  // Decided by the first bytes rather than the extension. A screenshot gets
  // renamed, a .png can hold a JPEG, and a file with no extension at all is an
  // ordinary thing to find in a project. Reading a binary as text produces a
  // page of replacement characters either way, so the type has to be known.
  let sniffed: string | null
  try {
    sniffed = await detectImageMimeTypeFromFile(absolutePath)
  } catch (error) {
    throw describeFileError(error, requested)
  }

  if (sniffed !== null) {
    return readImage(absolutePath, sniffed, requested, context)
  }

  let text: string
  try {
    text = (await readFile(absolutePath, 'utf-8')).toString()
  } catch (error) {
    throw describeFileError(error, requested)
  }

  // Checked before the lines are computed, because an empty file still
  // produces one empty line and would otherwise fall through to a blank result
  // that reads to a model like a file it failed to fetch.
  if (text.length === 0) {
    return { content: 'File is empty.', details: { path: absolutePath, totalLines: 0 } }
  }

  const allLines = text.split('\n')
  const startLine = offset === undefined ? 0 : Math.max(0, offset - 1)
  const startLineDisplay = startLine + 1

  // A bad offset is a bad request rather than file content, so it fails and
  // names the real line count. Returning an empty result instead reads to a
  // model like it successfully read a file that happens to be blank.
  if (startLine >= allLines.length) {
    throw new Error(
      'Offset ' +
        String(startLineDisplay) +
        ' is beyond end of file (' +
        String(allLines.length) +
        ' lines total)'
    )
  }

  let selected: string
  let userLimitedLines: number | undefined
  if (limit !== undefined) {
    const endLine = Math.min(startLine + limit, allLines.length)
    selected = allLines.slice(startLine, endLine).join('\n')
    userLimitedLines = endLine - startLine
  } else {
    selected = allLines.slice(startLine).join('\n')
  }

  const truncation = truncateHead(selected)
  let output: string
  let details: Record<string, unknown> = { path: absolutePath, totalLines: allLines.length }

  if (truncation.firstLineExceedsLimit) {
    // There is no whole line to hand back and no way to return part of one, so
    // the size is reported instead of a fragment that would be mistaken for the
    // real line.
    const firstLine = allLines[startLine] ?? ''
    output =
      'Line ' +
      String(startLineDisplay) +
      ' is ' +
      formatSize(Buffer.byteLength(firstLine, 'utf-8')) +
      ', larger than the ' +
      formatSize(DEFAULT_MAX_BYTES) +
      ' limit for a single result, so it cannot be returned. There is no way to read part of a line with this tool.'
  } else if (truncation.truncated) {
    const endLineDisplay = startLineDisplay + truncation.outputLines - 1
    const nextOffset = endLineDisplay + 1
    output = truncation.content
    if (truncation.truncatedBy === 'lines') {
      output +=
        '\n\n[Showing lines ' +
        String(startLineDisplay) +
        '-' +
        String(endLineDisplay) +
        ' of ' +
        String(allLines.length) +
        '. Use offset=' +
        String(nextOffset) +
        ' to continue.]'
    } else {
      output +=
        '\n\n[Showing lines ' +
        String(startLineDisplay) +
        '-' +
        String(endLineDisplay) +
        ' of ' +
        String(allLines.length) +
        ' (' +
        formatSize(DEFAULT_MAX_BYTES) +
        ' limit). Use offset=' +
        String(nextOffset) +
        ' to continue.]'
    }
    details = { ...details, truncated: true, nextOffset }
  } else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
    const remaining = allLines.length - (startLine + userLimitedLines)
    const nextOffset = startLine + userLimitedLines + 1
    output =
      truncation.content +
      '\n\n[' +
      String(remaining) +
      ' more lines. Use offset=' +
      String(nextOffset) +
      ' to continue.]'
    details = { ...details, remaining, nextOffset }
  } else {
    output = truncation.content
  }

  return { content: output, details }
}

export const readTool: Tool = {
  name: 'read',
  description:
    'Read the contents of a file. Images (jpg, png, gif, webp) are returned to you as images. Text output is truncated to ' +
    String(DEFAULT_MAX_LINES) +
    ' lines or ' +
    String(DEFAULT_MAX_BYTES / 1024) +
    'KB, whichever comes first. For a larger file, continue with offset until you have the whole thing. Always read a file before editing it.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to read (relative or absolute)' },
      offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
      limit: { type: 'number', description: 'Maximum number of lines to read' }
    },
    required: ['path'],
    additionalProperties: false
  },
  run: runRead
}
