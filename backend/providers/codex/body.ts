import type { ChatRequest } from '../types'
import { clampPromptCacheKey } from './endpoints'
import { convertMessages, convertTools } from './messages'

const OMITTED_EFFORTS = new Set(['default', 'off', 'none'])

export interface CodexRequestBody {
  model: string
  store: false
  stream: true
  instructions: string
  input: unknown[]
  text: { verbosity: 'low' }
  include: string[]
  prompt_cache_key?: string
  tool_choice: 'auto'
  parallel_tool_calls: true
  temperature?: number
  tools?: unknown[]
  reasoning?: { effort: string; summary: 'auto' }
}

export function mapReasoningEffort(effort: string): string {
  if (effort === 'minimal') return 'low'
  return effort
}

export function buildRequestBody(request: ChatRequest): CodexRequestBody {
  const converted = convertMessages(request.messages)
  const cacheKey = clampPromptCacheKey(request.sessionId)
  const body: CodexRequestBody = {
    model: request.model,
    store: false,
    stream: true,
    instructions: converted.instructions,
    input: converted.input,
    text: { verbosity: 'low' },
    include: ['reasoning.encrypted_content'],
    tool_choice: 'auto',
    parallel_tool_calls: true,
    ...(cacheKey !== undefined ? { prompt_cache_key: cacheKey } : {}),
  }

  if (request.temperature !== undefined) body.temperature = request.temperature

  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = convertTools(request.tools)
  }

  const effort = request.reasoningEffort
  if (effort !== undefined && !OMITTED_EFFORTS.has(effort)) {
    body.reasoning = { effort: mapReasoningEffort(effort), summary: 'auto' }
  }

  return body
}
