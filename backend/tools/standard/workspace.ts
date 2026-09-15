import { findMethod } from '../compute/providers/catalog'
import { validateArguments } from '../compute/schema/validation'
import { saveOutput } from '../compute/results/artifacts'
import type { Tool, JsonSchema } from '../types'

const descriptions: Record<string, string> = {
  read: 'Read a text file or image. Relative paths start at the project directory; absolute and home-relative paths are supported. offset is 1-indexed and limit counts lines. Supported images are returned as attachments when the model supports them.',
  write: 'Create or replace a file with content. Creates missing parent directories.',
  edit: 'Precisely edit a file using disjoint oldText/newText replacements in edits. Each oldText must match exactly once in the original file. Replacements must not overlap.',
  glob: 'Find file paths matching a glob pattern. A single * matches one path component; ** is recursive.',
  grep: 'Search UTF-8 files with a regular expression. Returns paths, line numbers, and matching text.',
}

/** Direct tools share compute's schemas, validation, file operations and image path. */
export const workspaceTools: readonly Tool[] = ['read', 'write', 'edit', 'glob', 'grep'].map(name => {
  const method = findMethod('workspace', name)?.method
  if (!method) throw new Error('Missing workspace implementation: ' + name)
  return {
    name, description: descriptions[name]!, parameters: method.schema as JsonSchema,
    async run(input, context) {
      const invalid = validateArguments(method, input)
      if (invalid) throw new Error(invalid)
      context.signal?.throwIfAborted()
      const result = await method.run(input as Record<string, unknown>, {
        cwd: context.cwd, signal: context.signal, execGroups: new Set(),
        model: { input: context.acceptsImages ? ['text', 'image'] : ['text'] },
      })
      const rawDetails = result.details && typeof result.details === 'object' ? result.details as Record<string, unknown> : {}
      const { codeModeValue, ...details } = rawDetails
      let content = 'codeModeValue' in rawDetails ? JSON.stringify(codeModeValue, null, 2)
        : result.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
      if (Buffer.byteLength(content, 'utf8') > 8000 || content.split('\n').length > 2000) {
        try {
          const path = await saveOutput(content)
          content = 'Full output saved to ' + path + '. Use read to inspect it. Do not repeat completed writes.\n' + [...content].slice(0, 1500).join('') + '\n[preview truncated]'
        } catch (error) {
          return { content: 'Operation returned, but saving its output failed: ' + String(error) + '. Side effects may have occurred. Do not repeat writes blindly.', isError: true }
        }
      }
      const images = result.content.filter(part => part.type === 'image')
      return { content, isError: result.isError ?? false, details,
        ...(context.acceptsImages && images.length ? { images } : {}),
      }
    },
  }
})
