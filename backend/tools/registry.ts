import { computeTool } from './compute/tool/adapter'
import { bashTool } from './bash/tool'
import { workspaceTools } from './standard/workspace'
import type { Workflow } from '../../contracts/workflow'
import type { Tool } from './types'

export const TOOLS: readonly Tool[] = [computeTool]
const STANDARD_TOOLS: readonly Tool[] = [bashTool, ...workspaceTools]
export function toolsForWorkflow(workflow: Workflow = 'compute'): readonly Tool[] {
  if (workflow === 'compute') return TOOLS
  if (workflow === 'standard') return STANDARD_TOOLS
  throw new Error('Unknown workflow: ' + String(workflow))
}

export function toolByName(name: string, workflow: Workflow = 'compute'): Tool | undefined {
  return toolsForWorkflow(workflow).find(tool => tool.name === name)
}

export function toolDefinitions(runtimePolicy = '', workflow: Workflow = 'compute'): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
  return toolsForWorkflow(workflow).map(tool => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description + (tool.name === 'compute' && runtimePolicy ? '\n\n' + runtimePolicy : ''), parameters: tool.parameters },
  }))
}
