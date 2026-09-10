/**
 * Message serialization for summarization.
 *
 * The conversation is rendered as plain text and wrapped in tags before it
 * reaches the model, so the model reads it as material to summarize instead of
 * a conversation to continue. Tool results are truncated: a summary does not
 * need the full body of every file that was read.
 */

import type { AssistantMessage, Message, ToolCall } from '../sessions/types'

/** Characters kept from a single tool result. */
const TOOL_RESULT_MAX_CHARS = 2000

/** Keep the opening of a long tool result and say how much was dropped. */
function truncateForSummary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const dropped = text.length - maxChars
  return text.slice(0, maxChars) + '\n\n[... ' + dropped + ' more characters truncated]'
}

/** Concatenate the text blocks of string-or-block content. Other block types contribute nothing. */
function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('')
}

/** JSON that survives values JSON.stringify refuses, such as cycles. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined'
  } catch {
    return '"[unserializable]"'
  }
}

/** Render one assistant message as its thinking, text, and tool call lines. */
function serializeAssistant(assistant: AssistantMessage): string[] {
  const parts: string[] = []
  const content = Array.isArray(assistant.content) ? assistant.content : []

  const thinkingParts: string[] = []
  const toolCalls: string[] = []
  let hasText = false

  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    if (block.type === 'thinking') {
      if (typeof block.thinking === 'string' && block.thinking !== '') thinkingParts.push(block.thinking)
    } else if (block.type === 'toolCall') {
      const call = block as ToolCall
      const args = call.arguments
      const rendered =
        args === null || typeof args !== 'object'
          ? ''
          : Object.entries(args)
              .map(([key, value]) => key + '=' + safeStringify(value))
              .join(', ')
      toolCalls.push(call.name + '(' + rendered + ')')
    } else if (block.type === 'text') {
      hasText = true
    }
  }

  if (thinkingParts.length > 0) parts.push('[Assistant thinking]: ' + thinkingParts.join('\n'))
  if (hasText) parts.push('[Assistant]: ' + textFromContent(content))
  if (toolCalls.length > 0) parts.push('[Assistant tool calls]: ' + toolCalls.join('; '))
  return parts
}

/**
 * Serialize LLM messages to text for summarization. Call convertToLlm() first
 * so UI-only message kinds are already folded into the base roles.
 */
export function serializeConversation(messages: Message[]): string {
  const parts: string[] = []

  for (const message of messages) {
    if (message === undefined || message === null) continue

    if (message.role === 'user') {
      const content = textFromContent(message.content)
      if (content !== '') parts.push('[User]: ' + content)
    } else if (message.role === 'assistant') {
      parts.push(...serializeAssistant(message as AssistantMessage))
    } else if (message.role === 'toolResult') {
      const content = textFromContent(message.content)
      if (content !== '') parts.push('[Tool result]: ' + truncateForSummary(content, TOOL_RESULT_MAX_CHARS))
    }
  }

  return parts.join('\n\n')
}

export { TOOL_RESULT_MAX_CHARS }
