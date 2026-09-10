import { editTool } from './edit'
import { readTool } from './read'
import type { Tool } from './types'
import { writeTool } from './write'

/**
 * The tools a run gets.
 *
 * Named as a set rather than assembled at each call site, so the list the model
 * is offered and the list that can actually run cannot drift apart. shell is
 * deliberately absent: this client does not offer it.
 */
export const TOOLS: readonly Tool[] = [readTool, writeTool, editTool]

export function toolByName(name: string): Tool | undefined {
  return TOOLS.find((tool) => tool.name === name)
}

export function toolDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
  return TOOLS.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters }
  }))
}
