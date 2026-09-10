import { constants } from 'node:fs'
import { access, readFile, writeFile } from 'node:fs/promises'

import { applyEditsToNormalizedContent, type Edit } from './applyEdits'
import { generateDiffString, generateUnifiedPatch } from './diffString'
import { detectLineEnding, normalizeToLF, restoreLineEndings, splitBom } from './lineEndings'
import { withFileMutationQueue } from './mutationQueue'
import { resolveToCwd } from './paths'
import type { Tool, ToolContext, ToolOutcome } from './types'

/**
 * Precise edits by exact text replacement.
 *
 * Every replacement is matched against the file as it was, so a model can
 * describe several unrelated changes in one call and does not have to work out
 * what the file looks like partway through its own list.
 */

/**
 * Accept the shapes models actually send.
 *
 * The schema says edits is an array of {oldText, newText}. In practice some
 * models send it as a JSON string, some send a single object instead of a one
 * element array, and some put oldText and newText at the top level. All three
 * mean the same thing, and rejecting them would fail an edit that was correct.
 */
function prepareEditArguments(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object') {
    throw new Error('Edit arguments must be an object.')
  }

  const args = { ...(input as Record<string, unknown>) }

  if (typeof args.edits === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(args.edits)
    } catch {
      throw new Error('edits was a string but not valid JSON, so it could not be understood.')
    }
    if (Array.isArray(parsed)) {
      args.edits = parsed
    } else if (isSingleEdit(parsed)) {
      args.edits = [parsed]
    } else {
      throw new Error('edits was a JSON string but did not contain an edit or a list of edits.')
    }
  } else if (isSingleEdit(args.edits)) {
    args.edits = [args.edits]
  }

  if (typeof args.oldText === 'string' && typeof args.newText === 'string') {
    const existing = Array.isArray(args.edits) ? [...args.edits] : []
    existing.push({ oldText: args.oldText, newText: args.newText })
    delete args.oldText
    delete args.newText
    args.edits = existing
  }

  return args
}

function isSingleEdit(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.oldText === 'string' && typeof record.newText === 'string'
}

function validateEdits(args: Record<string, unknown>): Edit[] {
  if (!Array.isArray(args.edits) || args.edits.length === 0) {
    throw new Error('edits must contain at least one replacement.')
  }

  return args.edits.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('edits[' + String(index) + '] must be an object with oldText and newText.')
    }
    const record = entry as Record<string, unknown>
    if (typeof record.oldText !== 'string') {
      throw new Error('edits[' + String(index) + '].oldText must be a string.')
    }
    if (typeof record.newText !== 'string') {
      throw new Error('edits[' + String(index) + '].newText must be a string.')
    }
    return { oldText: record.oldText, newText: record.newText }
  })
}

async function runEdit(input: unknown, context: ToolContext): Promise<ToolOutcome> {
  const args = prepareEditArguments(input)
  const requested = args.path
  if (typeof requested !== 'string' || requested.length === 0) {
    throw new Error('path is required and must be a non-empty string.')
  }

  const edits = validateEdits(args)
  const absolutePath = resolveToCwd(requested, context.cwd)

  return withFileMutationQueue(absolutePath, async () => {
    const throwIfAborted = (): void => {
      if (context.signal?.aborted === true) {
        throw new Error('Operation aborted')
      }
    }

    throwIfAborted()

    try {
      await access(absolutePath, constants.R_OK | constants.W_OK)
    } catch (error) {
      throwIfAborted()
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new Error('Could not edit ' + requested + '. No such file. Read it first, or use write to create it.')
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error('Could not edit ' + requested + '. Permission denied.')
      }
      if (code === 'EISDIR') {
        throw new Error('Could not edit ' + requested + '. It is a directory.')
      }
      throw new Error('Could not edit ' + requested + '. ' + (error instanceof Error ? error.message : String(error)))
    }
    throwIfAborted()

    const raw = await readFile(absolutePath, 'utf-8')
    throwIfAborted()

    // A model cannot see a byte order mark and will never include one in the
    // text it asks to replace, so it is stripped before matching and put back
    // before writing.
    const { bom, text } = splitBom(raw)
    const originalEnding = detectLineEnding(text)
    const normalized = normalizeToLF(text)

    const { baseContent, newContent } = applyEditsToNormalizedContent(normalized, edits, requested)
    throwIfAborted()

    const finalContent = bom + restoreLineEndings(newContent, originalEnding)
    await writeFile(absolutePath, finalContent, 'utf-8')
    throwIfAborted()

    const { diff, firstChangedLine } = generateDiffString(baseContent, newContent)
    const patch = generateUnifiedPatch(requested, baseContent, newContent)

    const subject = edits.length === 1 ? '1 edit' : String(edits.length) + ' edits'
    const where = firstChangedLine === undefined ? '' : ' First changed line: ' + String(firstChangedLine) + '.'

    return {
      content: 'Applied ' + subject + ' to ' + requested + '.' + where,
      details: {
        path: absolutePath,
        diff,
        patch,
        ...(firstChangedLine === undefined ? {} : { firstChangedLine }),
        edits: edits.length
      }
    }
  })
}

export const editTool: Tool = {
  name: 'edit',
  description:
    'Edit a file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the file, and is matched against the original file rather than against earlier edits in the same call. If two changes touch the same or nearby lines, merge them into one edit. Keep oldText as small as possible while still unique.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to edit (relative or absolute)' },
      edits: {
        type: 'array',
        description: 'One or more replacements, each matched against the original file.',
        items: {
          type: 'object',
          properties: {
            oldText: {
              type: 'string',
              description: 'Exact text to replace. Must be unique in the file and must not overlap another edit.'
            },
            newText: { type: 'string', description: 'Text to replace it with.' }
          },
          required: ['oldText', 'newText'],
          additionalProperties: false
        }
      }
    },
    required: ['path', 'edits'],
    additionalProperties: false
  },
  run: runEdit
}
