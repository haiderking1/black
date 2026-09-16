import type { ChatMessage, ToolCall } from '../types'

export type ResponsesInput = unknown[]

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return value as Record<string, unknown>
}

function normalizeIdPart(part: string): string {
  const sanitized = part.replace(/[^a-zA-Z0-9_-]/g, '_')
  const normalized = sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized
  return normalized.replace(/_+$/, '')
}

function splitToolCallId(id: string): { callId: string; itemId?: string } {
  if (!id.includes('|')) return { callId: normalizeIdPart(id) }
  const [callId, itemId] = id.split('|', 2)
  return {
    callId: normalizeIdPart(callId ?? id),
    ...(itemId !== undefined && itemId !== '' ? { itemId: normalizeIdPart(itemId) } : {}),
  }
}

function reasoningItemFromSignature(signature: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(signature)
    const record = asRecord(parsed)
    if (record === undefined) return undefined
    if (record['type'] !== 'reasoning') return undefined
    return record
  } catch {
    return undefined
  }
}

function userContent(message: ChatMessage): unknown {
  const images = message.images ?? []
  if (images.length === 0) {
    return [{ type: 'input_text', text: message.content }]
  }
  return [
    ...(message.content === '' ? [] : [{ type: 'input_text', text: message.content }]),
    ...images.map((image) => ({
      type: 'input_image',
      detail: 'auto',
      image_url: 'data:' + image.mimeType + ';base64,' + image.data,
    })),
  ]
}

function assistantItems(message: ChatMessage, index: number): unknown[] {
  const items: unknown[] = []
  const reasoning = message.thinkingSignature !== undefined
    ? reasoningItemFromSignature(message.thinkingSignature)
    : undefined
  if (reasoning !== undefined) items.push(reasoning)

  if (message.content !== '') {
    items.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: message.content, annotations: [] }],
      status: 'completed',
      id: 'msg_black_' + String(index),
    })
  }

  for (const call of message.toolCalls ?? []) {
    items.push(functionCallItem(call))
  }
  return items
}

function functionCallItem(call: ToolCall): Record<string, unknown> {
  const ids = splitToolCallId(call.id)
  const item: Record<string, unknown> = {
    type: 'function_call',
    call_id: ids.callId,
    name: call.name,
    arguments: call.arguments,
  }
  if (ids.itemId !== undefined && ids.itemId.startsWith('fc_')) item['id'] = ids.itemId
  return item
}

export interface ConvertedTranscript {
  instructions: string
  input: ResponsesInput
}

/**
 * Turn black's chat history into a Codex Responses request.
 *
 * The first system message becomes `instructions`. Everything after that is
 * `input`, including reasoning items replayed from earlier turns so the model
 * does not re-derive thinking it already paid for.
 */
export function convertMessages(messages: readonly ChatMessage[]): ConvertedTranscript {
  let instructions = ''
  const input: unknown[] = []
  let sawLeadingSystem = false
  let assistantIndex = 0

  for (const message of messages) {
    if (message.role === 'system') {
      if (!sawLeadingSystem && instructions === '' && input.length === 0) {
        instructions = message.content
        sawLeadingSystem = true
        continue
      }
      if (message.content !== '') {
        input.push({ role: 'developer', content: message.content })
      }
      continue
    }

    if (message.role === 'user') {
      input.push({ role: 'user', content: userContent(message) })
      continue
    }

    if (message.role === 'assistant') {
      input.push(...assistantItems(message, assistantIndex))
      assistantIndex += 1
      continue
    }

    if (message.role === 'tool') {
      const ids = splitToolCallId(message.toolCallId ?? '')
      input.push({
        type: 'function_call_output',
        call_id: ids.callId,
        output: message.content === '' ? '(no tool output)' : message.content,
      })
    }
  }

  return {
    instructions: instructions === '' ? 'You are a helpful assistant.' : instructions,
    input,
  }
}

export function convertTools(tools: readonly unknown[]): unknown[] {
  const converted: unknown[] = []
  for (const tool of tools) {
    const record = asRecord(tool)
    if (record === undefined) continue
    if (record['type'] === 'function') {
      const fn = asRecord(record['function'])
      if (fn === undefined) continue
      if (typeof fn['name'] !== 'string' || fn['name'] === '') continue
      converted.push({
        type: 'function',
        name: fn['name'],
        ...(typeof fn['description'] === 'string' ? { description: fn['description'] } : {}),
        ...(fn['parameters'] !== undefined ? { parameters: fn['parameters'] } : {}),
        strict: false,
      })
      continue
    }
    converted.push(tool)
  }
  return converted
}
