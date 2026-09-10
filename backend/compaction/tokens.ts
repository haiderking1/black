/**
 * Context size accounting for compaction.
 *
 * Real usage reported by the provider wins when it is available; everything
 * after the last reported usage is estimated from character counts.
 */

import type { AgentMessage, AssistantMessage, SessionEntry, Usage } from '../sessions/types'
import type { ContextUsageEstimate, ResolvedCompactionSettings } from './types'

/** Characters attributed to one image block, standing in for its real token cost. */
const ESTIMATED_IMAGE_CHARS = 4800

/**
 * Chars per token. Four is the usual rough ratio for English text, and rounding
 * up keeps the estimate on the safe side.
 */
const CHARS_PER_TOKEN = 4

function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Whether a value is a usable object. Session files are parsed without
 * validation, so a JSON null can reach these functions as readily as a
 * missing field.
 */
export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined && typeof value === 'object'
}

/**
 * Total context tokens for one usage record. Uses totalTokens when present and
 * falls back to summing the components.
 */
export function calculateContextTokens(usage: Usage): number {
  const total = finiteOrZero(usage.totalTokens)
  if (total > 0) return total
  return (
    finiteOrZero(usage.input) +
    finiteOrZero(usage.output) +
    finiteOrZero(usage.cacheRead) +
    finiteOrZero(usage.cacheWrite)
  )
}

/**
 * Usage from an assistant message, or undefined when it carries none.
 * Aborted and errored messages report nothing usable, and an all-zero usage is
 * treated as absent so it cannot anchor an estimate at zero.
 */
function getAssistantUsage(message: AgentMessage): Usage | undefined {
  if (message.role !== 'assistant') return undefined

  const assistant = message as AssistantMessage
  if (assistant.stopReason === 'aborted' || assistant.stopReason === 'error') return undefined

  const usage = assistant.usage
  if (usage === undefined || usage === null) return undefined
  return calculateContextTokens(usage) > 0 ? usage : undefined
}

function getLastAssistantUsageInfo(messages: AgentMessage[]): { usage: Usage; index: number } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!isPresent(message)) continue
    const usage = getAssistantUsage(message)
    if (usage !== undefined) return { usage, index: i }
  }
  return undefined
}

/** Usage from the newest assistant message in a session entry list. */
export function getLastAssistantUsage(entries: SessionEntry[]): Usage | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!isPresent(entry) || entry.type !== 'message') continue
    const usage = getAssistantUsage(entry.message)
    if (usage !== undefined) return usage
  }
  return undefined
}

/**
 * Estimate context tokens for a message list. Everything up to and including
 * the last reported usage is taken from that usage; later messages are
 * estimated. With no usage anywhere, the whole list is estimated.
 */
export function estimateContextTokens(messages: AgentMessage[]): ContextUsageEstimate {
  const usageInfo = getLastAssistantUsageInfo(messages)

  if (usageInfo === undefined) {
    let estimated = 0
    for (const message of messages) {
      if (!isPresent(message)) continue
      estimated += estimateTokens(message)
    }
    return { tokens: estimated, usageTokens: 0, trailingTokens: estimated, lastUsageIndex: null }
  }

  const usageTokens = calculateContextTokens(usageInfo.usage)
  let trailingTokens = 0
  for (let i = usageInfo.index + 1; i < messages.length; i++) {
    const message = messages[i]
    if (!isPresent(message)) continue
    trailingTokens += estimateTokens(message)
  }

  return {
    tokens: usageTokens + trailingTokens,
    usageTokens,
    trailingTokens,
    lastUsageIndex: usageInfo.index,
  }
}

/** Character count for string content or a block list. Unknown shapes count as zero. */
function estimateTextAndImageContentChars(content: unknown): number {
  if (typeof content === 'string') return content.length
  if (!Array.isArray(content)) return 0

  let chars = 0
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    if (block.type === 'text') {
      if (typeof block.text === 'string') chars += block.text.length
    } else if (block.type === 'image') {
      chars += ESTIMATED_IMAGE_CHARS
    }
  }
  return chars
}

/**
 * Estimate one message in tokens from its character count. Session files are
 * parsed without validation, so every field is read defensively and a message
 * that carries nothing usable estimates to zero.
 */
export function estimateTokens(message: AgentMessage): number {
  if (!isPresent(message) || typeof message.role !== 'string') return 0

  let chars = 0

  switch (message.role) {
    case 'user':
      return Math.ceil(estimateTextAndImageContentChars(message.content) / CHARS_PER_TOKEN)

    case 'assistant': {
      const content = (message as AssistantMessage).content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'object' || block === null) continue
          if (block.type === 'text') {
            if (typeof block.text === 'string') chars += block.text.length
          } else if (block.type === 'thinking') {
            if (typeof block.thinking === 'string') chars += block.thinking.length
          } else if (block.type === 'toolCall') {
            if (typeof block.name === 'string') chars += block.name.length
            chars += safeJsonLength(block.arguments)
          }
        }
      }
      return Math.ceil(chars / CHARS_PER_TOKEN)
    }

    case 'custom':
    case 'toolResult':
      return Math.ceil(estimateTextAndImageContentChars(message.content) / CHARS_PER_TOKEN)

    case 'bashExecution':
      chars = safeLength(message.command) + safeLength(message.output)
      return Math.ceil(chars / CHARS_PER_TOKEN)

    case 'branchSummary':
    case 'compactionSummary':
      chars = safeLength(message.summary)
      return Math.ceil(chars / CHARS_PER_TOKEN)

    default:
      return 0
  }
}

function safeLength(value: unknown): number {
  return typeof value === 'string' ? value.length : 0
}

function safeJsonLength(value: unknown): number {
  if (value === undefined) return 0
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return 0
  }
}

/**
 * Whether the context has grown past the point where compaction should run.
 * The reserve is the headroom left for the next request and its response.
 */
/**
 * Sum the estimated cost of every message, ignoring any reported usage.
 * This measures a rebuilt context rather than a live one, which is why it does
 * not anchor on the last assistant usage the way estimateContextTokens() does.
 */
export function estimateMessagesTokens(messages: AgentMessage[]): number {
  let tokens = 0
  for (const message of messages) {
    if (!isPresent(message)) continue
    tokens += estimateTokens(message)
  }
  return tokens
}

/** A usage record with every counter at zero. */
export function zeroUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  }
}

/** Whether a value carries the required numeric counters of a usage record. */
export function isUsage(value: unknown): value is Usage {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { input?: unknown; totalTokens?: unknown; cost?: unknown }
  // Non-finite counters would serialize to JSON null and corrupt later cost
  // accounting, so they do not qualify as a usage record.
  return (
    typeof candidate.input === 'number' &&
    Number.isFinite(candidate.input) &&
    typeof candidate.totalTokens === 'number' &&
    Number.isFinite(candidate.totalTokens)
  )
}

function costOrZero(cost: unknown): Usage['cost'] {
  if (typeof cost !== 'object' || cost === null) {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  }
  const value = cost as Record<string, unknown>
  return {
    input: finiteOrZero(value['input']),
    output: finiteOrZero(value['output']),
    cacheRead: finiteOrZero(value['cacheRead']),
    cacheWrite: finiteOrZero(value['cacheWrite']),
    total: finiteOrZero(value['total'])
  }
}

/**
 * Add two usage records. Optional counters survive the sum only when at least
 * one side reported them, so an absent field stays absent.
 */
export function combineUsage(first: Usage, second: Usage): Usage {
  const combined: Usage = {
    input: finiteOrZero(first.input) + finiteOrZero(second.input),
    output: finiteOrZero(first.output) + finiteOrZero(second.output),
    cacheRead: finiteOrZero(first.cacheRead) + finiteOrZero(second.cacheRead),
    cacheWrite: finiteOrZero(first.cacheWrite) + finiteOrZero(second.cacheWrite),
    totalTokens: finiteOrZero(first.totalTokens) + finiteOrZero(second.totalTokens),
    cost: addCost(first.cost, second.cost)
  }

  if (first.cacheWrite1h !== undefined || second.cacheWrite1h !== undefined) {
    combined.cacheWrite1h = finiteOrZero(first.cacheWrite1h) + finiteOrZero(second.cacheWrite1h)
  }
  if (first.reasoning !== undefined || second.reasoning !== undefined) {
    combined.reasoning = finiteOrZero(first.reasoning) + finiteOrZero(second.reasoning)
  }

  return combined
}

function addCost(first: unknown, second: unknown): Usage['cost'] {
  const a = costOrZero(first)
  const b = costOrZero(second)
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    total: a.total + b.total
  }
}

export function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  settings: ResolvedCompactionSettings,
): boolean {
  if (!settings.enabled) return false
  return contextTokens > contextWindow - settings.reserveTokens
}
