import type { Tool, JsonSchema } from '../../types'
import { makeComputeToolDefinition } from './definition'

export const computeTool: Tool = {
 name: 'compute',
 get description() { const tool = makeComputeToolDefinition(); return tool.description + '\n\n' + tool.promptGuidelines.join('\n') },
 parameters: makeComputeToolDefinition().parameters as JsonSchema,
 async run(input, context) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('compute arguments must be an object')
  const result = await makeComputeToolDefinition().execute('', input, context.signal, undefined, {
   cwd: context.cwd, model: { input: context.acceptsImages ? ['text', 'image'] : ['text'] }
  })
  const images = result.content.filter(part => part.type === 'image')
  return {
   content: result.content.filter(part => part.type === 'text').map(part => part.text).join('\n'),
   isError: result.isError ?? false,
   ...(context.acceptsImages && images.length ? { images } : {}),
   ...(result.details && typeof result.details === 'object' ? { details: result.details as Record<string, unknown> } : {})
  }
 }
}
