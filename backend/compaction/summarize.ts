/**
 * Summary generation for compaction.
 *
 * The call sites here build one prompt, hand it to the injected
 * SummarizationCall, and validate the response before it can become a session
 * checkpoint. Failure is thrown here, because the caller asked for a checkpoint
 * it cannot proceed without. Branch summarization shares the response checks
 * but reports failure as a field instead; see ./branch-summarization.ts.
 */

import { convertToLlm } from '../sessions/messages'
import type { AgentMessage, Usage } from '../sessions/types'
import {
  SUMMARIZATION_PROMPT,
  SUMMARIZATION_SYSTEM_PROMPT,
  TURN_PREFIX_SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT
} from './prompts'
import { extractSummarizationText, getSummarizationFailure, summarizationTriedToolCall } from './response'
import { serializeConversation } from './serialization'
import { isUsage, zeroUsage } from './tokens'
import type { SummarizationOptions } from './types'

/** Share of the reserve a history summary may occupy. */
const HISTORY_SHARE = 0.8

/** Share of the reserve a turn prefix summary may occupy. It is the smaller half. */
const TURN_PREFIX_SHARE = 0.5

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value !== ''
}

/** Response budget: the share of the reserve, clamped by any caller-supplied cap. */
function responseMaxTokens(options: SummarizationOptions, share: number): number {
  const budget = Math.floor(share * options.reserveTokens)
  const cap = options.maxResponseTokens
  const bounded =
    typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? Math.min(budget, Math.floor(cap)) : budget
  return Math.max(1, bounded)
}

async function runSummarization(
  options: SummarizationOptions,
  promptText: string,
  maxTokens: number,
  label: string
): Promise<{ text: string; usage: Usage }> {
  const response = await options.call({
    systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
    text: promptText,
    maxTokens,
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {})
  })

  const failure = getSummarizationFailure(response, label)
  if (failure !== undefined) throw new Error(failure)
  if (summarizationTriedToolCall(response)) throw new Error(label + ' attempted to call a tool')

  return {
    text: extractSummarizationText(response),
    usage: isUsage(response.usage) ? response.usage : zeroUsage()
  }
}

/**
 * Summarize a conversation, or fold it into previousSummary when one is given,
 * so a compacted session can be compacted again without losing earlier facts.
 */
export async function generateSummaryWithUsage(
  messages: AgentMessage[],
  options: SummarizationOptions
): Promise<{ text: string; usage: Usage }> {
  const updating = isNonEmpty(options.previousSummary)
  let basePrompt = updating ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT
  if (isNonEmpty(options.customInstructions)) {
    basePrompt = basePrompt + '\n\nAdditional focus: ' + options.customInstructions
  }

  const conversationText = serializeConversation(convertToLlm(messages))
  let promptText = '<conversation>\n' + conversationText + '\n</conversation>\n\n'
  if (updating) {
    promptText += '<previous-summary>\n' + options.previousSummary + '\n</previous-summary>\n\n'
  }
  promptText += basePrompt

  return runSummarization(options, promptText, responseMaxTokens(options, HISTORY_SHARE), 'Summarization')
}

/** Summary text with the usage record dropped. */
export async function generateSummary(messages: AgentMessage[], options: SummarizationOptions): Promise<string> {
  return (await generateSummaryWithUsage(messages, options)).text
}

/** Summarize the opening prefix of a turn that was too large to keep whole. */
export async function generateTurnPrefixSummary(
  messages: AgentMessage[],
  options: SummarizationOptions
): Promise<{ text: string; usage: Usage }> {
  const conversationText = serializeConversation(convertToLlm(messages))
  const promptText =
    '<conversation>\n' + conversationText + '\n</conversation>\n\n' + TURN_PREFIX_SUMMARIZATION_PROMPT
  return runSummarization(
    options,
    promptText,
    responseMaxTokens(options, TURN_PREFIX_SHARE),
    'Turn prefix summarization'
  )
}
