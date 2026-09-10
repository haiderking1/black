import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'

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

/** Image types the tool recognises. It cannot return their contents. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp'
}

function imageMimeType(path: string): string | undefined {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return IMAGE_EXTENSIONS[extension]
}

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

  const mimeType = imageMimeType(absolutePath)
  if (mimeType !== undefined) {
    // The contents are not returned. Saying so plainly is better than returning
    // decoded bytes that would be meaningless as text.
    return {
      content:
        'Read image file [' +
        mimeType +
        ']. Its pixel contents cannot be returned to you, so describe what you need from it or work with the surrounding code instead.',
      details: { path: absolutePath, mimeType }
    }
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

  // Asking for a line past the end returns nothing at all unless it is said out
  // loud, and an empty result reads to a model like an empty file.
  if (startLine >= allLines.length) {
    return {
      content:
        'offset ' +
        String(startLineDisplay) +
        ' is past the end of the file. It has ' +
        String(allLines.length) +
        ' lines.',
      details: { path: absolutePath, totalLines: allLines.length }
    }
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
    'Read the contents of a file. Output is truncated to ' +
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
