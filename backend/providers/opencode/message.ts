import type { ChatMessage } from '../types'

/**
 * One message, in the shape the completions API expects.
 *
 * An assistant message that stops to call a tool has content it may not have
 * written anything for. Some gateways reject an empty string there and want
 * null, so an empty body on a tool asking turn is sent as null.
 */
export function buildMessage(message: ChatMessage): Record<string, unknown> {
  const images = message.images ?? []

  // With an image present the content becomes a list of typed parts. The text
  // part is dropped when there is no text, because an empty text part is
  // rejected by some gateways.
  const content =
    images.length > 0
      ? [
          ...(message.content === '' ? [] : [{ type: 'text', text: message.content }]),
          ...images.map((image) => ({
            type: 'image_url',
            image_url: { url: 'data:' + image.mimeType + ';base64,' + image.data },
          })),
        ]
      : message.content === '' && message.toolCalls !== undefined
        ? null
        : message.content

  const out: Record<string, unknown> = {
    role: message.role,
    content,
  }
  if (message.toolCalls !== undefined) {
    out['tool_calls'] = message.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }))
  }
  if (message.toolCallId !== undefined) {
    out['tool_call_id'] = message.toolCallId
  }
  if (message.role === 'assistant' && message.thinkingSignature !== undefined) {
    try { out['reasoning_details'] = JSON.parse(message.thinkingSignature) }
    catch { /* Non-JSON block signatures are retained locally, not sent as invalid details. */ }
  }
  return out
}
