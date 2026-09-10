/**
 * Reading a summarization response.
 *
 * Both summarizers in this directory judge their response the same way, so the
 * checks live here rather than in either one. A summary is only usable when the
 * model stopped for a reason that produced complete text and answered in prose.
 */

import type { AssistantMessage } from '../sessions/types'

/**
 * Why a summarization response cannot be used, or undefined when it can.
 * A length stop carries partial text, so it must never become a checkpoint.
 *
 * An abort is deliberately not reported here, matching pi. The abort guard
 * belongs at the call site: pi checks its abort signal after compact() returns
 * and before appendCompaction(), so nothing is written. Branch summarization is
 * the exception that checks aborts itself, before reaching this function.
 */
export function getSummarizationFailure(response: AssistantMessage, label: string): string | undefined {
  if (response.stopReason === 'error') {
    const reason =
      typeof response.errorMessage === 'string' && response.errorMessage !== ''
        ? response.errorMessage
        : 'Unknown error'
    return label + ' failed: ' + reason
  }
  if (response.stopReason === 'length') {
    return label + ' failed: generation hit the token cap and the summary is incomplete'
  }
  return undefined
}

/** Concatenate the text blocks of a response. Other block types contribute nothing. */
export function extractSummarizationText(response: AssistantMessage): string {
  const content = response.content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('')
}

/** True when the model answered a summarization request with a tool call. */
export function summarizationTriedToolCall(response: AssistantMessage): boolean {
  const content = response.content
  if (!Array.isArray(content)) return false
  return content.some((block) => typeof block === 'object' && block !== null && block.type === 'toolCall')
}
