import { McpClient } from './client'
import { renderMcpContent } from './content'
import { toTypeBox } from './schema'
import { getProviders, refreshProviders } from '../catalog'
import { toolText } from '../../results/tool-result'

export async function discoverMcpTools(): Promise<void> {
 const client = new McpClient()
 await client.connect()
 const tools = await client.listTools()
 const provider = getProviders().find(provider => provider.name === 'mcp')
 if (!provider) throw new Error('MCP provider is missing')
 for (const tool of tools) {
  if (!tool?.name || provider.methods.some(method => method.name === tool.name)) continue
  provider.methods.push({
   name: tool.name,
   description: tool.description?.trim().replace(/\s+/g, ' ') || 'MCP tool: ' + tool.name,
   schema: toTypeBox(tool.inputSchema), returns: 'ComputeToolOutput',
   run: async (args, env) => toolText(renderMcpContent(await client.callTool(tool.name, args, env.signal), tool.name))
  })
 }
 refreshProviders()
}
