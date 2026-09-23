import type { ChatMessage, ToolCall } from '../types'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

function reasoningFromSignature(signature: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(signature)
    const item = record(value)
    return item?.type === 'reasoning' ? item : undefined
  } catch {
    return undefined
  }
}

function functionCall(call: ToolCall): Record<string, unknown> {
  return { type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments }
}

function userContent(message: ChatMessage): unknown {
  const images = message.images ?? []
  return [
    ...(message.content === '' ? [] : [{ type: 'input_text', text: message.content }]),
    ...images.map(image => ({
      type: 'input_image',
      detail: 'auto',
      image_url: 'data:' + image.mimeType + ';base64,' + image.data,
    })),
  ]
}

/** Convert the saved chat transcript into Responses API input items. */
export function experientialInput(messages: readonly ChatMessage[]): unknown[] {
  const input: unknown[] = []
  let assistantIndex = 0
  for (const message of messages) {
    if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.toolCallId ?? '',
        output: message.content === '' ? '(no tool output)' : message.content })
      continue
    }
    if (message.role === 'assistant') {
      const reasoning = message.thinkingSignature === undefined ? undefined : reasoningFromSignature(message.thinkingSignature)
      if (reasoning !== undefined) input.push(reasoning)
      if (message.content !== '') input.push({
        type: 'message', role: 'assistant',
        content: [{ type: 'output_text', text: message.content, annotations: [] }],
        status: 'completed', id: 'msg_black_' + String(assistantIndex),
      })
      assistantIndex++
      for (const call of message.toolCalls ?? []) input.push(functionCall(call))
      continue
    }
    if (message.role === 'user') {
      input.push({ role: 'user', content: userContent(message) })
      continue
    }
    input.push({ role: message.role, content: message.content })
  }
  return input
}

/** Convert the app's Chat Completions tool declarations to Responses functions. */
export function experientialTools(tools: readonly unknown[]): unknown[] {
  const result: unknown[] = []
  for (const value of tools) {
    const tool = record(value)
    if (tool === undefined) continue
    if (tool.type !== 'function') {
      result.push(tool)
      continue
    }
    const fn = record(tool.function)
    if (fn === undefined || typeof fn.name !== 'string' || fn.name === '') continue
    result.push({ type: 'function', name: fn.name,
      ...(typeof fn.description === 'string' ? { description: fn.description } : {}),
      ...(fn.parameters === undefined ? {} : { parameters: fn.parameters }), strict: false })
  }
  return result
}
