import { computeTool } from './compute/tool/adapter'
import type { Tool } from './types'

/**
 * The tools a run gets.
 *
 * Named as a set rather than assembled at each call site, so the list the model
 * is offered and the list that can actually run cannot drift apart. Provider
 * methods are available only inside compute plans, not as separate tools.
 */
export const TOOLS: readonly Tool[] = [computeTool]

export function toolByName(name: string): Tool | undefined {
  return TOOLS.find((tool) => tool.name === name)
}

export function toolDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
  return TOOLS.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters }
  }))
}
