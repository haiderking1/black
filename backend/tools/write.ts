import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { withFileMutationQueue } from './mutationQueue'
import { resolveToCwd } from './paths'
import type { Tool, ToolContext, ToolOutcome } from './types'

/**
 * Creating or replacing a whole file.
 *
 * Parent directories are created, because a model writing a new module should
 * not need a second call just to make the folder.
 *
 * An abort is checked between operations rather than by rejecting from an
 * event listener. Rejecting from a listener would release the per-file queue
 * while a write was still in flight, and the next writer would start from a
 * half written file.
 */

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(field + ' is required and must be a string.')
  }
  return value
}

async function runWrite(input: unknown, context: ToolContext): Promise<ToolOutcome> {
  const args = (input ?? {}) as Record<string, unknown>
  const requested = requireString(args.path, 'path')
  const content = requireString(args.content, 'content')

  const absolutePath = resolveToCwd(requested, context.cwd)
  const directory = dirname(absolutePath)

  return withFileMutationQueue(absolutePath, async () => {
    const throwIfAborted = (): void => {
      if (context.signal?.aborted === true) {
        throw new Error('Operation aborted')
      }
    }

    throwIfAborted()
    try {
      await mkdir(directory, { recursive: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error('Could not create ' + directory + '. Permission denied.')
      }
      if (code === 'ENOTDIR' || code === 'EEXIST') {
        throw new Error('Could not create ' + directory + '. A file on that path is not a directory.')
      }
      throw error
    }
    throwIfAborted()

    try {
      await writeFile(absolutePath, content, 'utf-8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EISDIR') {
        throw new Error('Could not write ' + requested + '. It is a directory.')
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new Error('Could not write ' + requested + '. Permission denied.')
      }
      throw error
    }
    throwIfAborted()

    const lines = content === '' ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0)
    return {
      content: 'Wrote ' + requested + ' (' + String(lines) + ' lines).',
      details: { path: absolutePath, lines }
    }
  })
}

export const writeTool: Tool = {
  name: 'write',
  description:
    'Write content to a file. Creates the file if it does not exist and replaces it if it does, creating parent directories as needed. Use this only for a new file or a complete rewrite; for a change to an existing file use edit.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to write (relative or absolute)' },
      content: { type: 'string', description: 'Content to write to the file' }
    },
    required: ['path', 'content'],
    additionalProperties: false
  },
  run: runWrite
}
