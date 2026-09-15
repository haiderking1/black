import type { ThinkingSupport } from '../types'

export const FALLBACK_CONTEXT_WINDOW = 128_000

export interface OpenRouterCapabilities {
  context: number
  thinking: ThinkingSupport
  images: boolean
  tools: boolean
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item !== '')
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

/**
 * Reasoning control published on one catalog row.
 *
 * Effort lists are the only values this client can send. A reasoning model
 * without one is unknown, so nothing is sent rather than a guessed level. A
 * model that does not mention reasoning at all is none.
 */
export function readThinking(record: Record<string, unknown>): ThinkingSupport {
  const parameters = stringList(record['supported_parameters'])
  const reasoning = record['reasoning']
  const efforts = typeof reasoning === 'object' && reasoning !== null
    ? stringList((reasoning as { supported_efforts?: unknown }).supported_efforts)
    : []

  if (efforts.length > 0) {
    return { reasoning: true, kind: 'effort', levels: efforts }
  }

  const mentionsReasoning = parameters.includes('reasoning') || (typeof reasoning === 'object' && reasoning !== null)
  if (mentionsReasoning) {
    return { reasoning: true, kind: 'unknown', levels: [] }
  }

  return { reasoning: false, kind: 'none', levels: [] }
}

export function readAcceptsImages(record: Record<string, unknown>): boolean {
  const architecture = record['architecture']
  if (typeof architecture !== 'object' || architecture === null) return false
  const input = (architecture as { input_modalities?: unknown }).input_modalities
  return Array.isArray(input) && input.includes('image')
}

export function readSupportsTools(record: Record<string, unknown>): boolean {
  return stringList(record['supported_parameters']).includes('tools')
}

export function readContextLength(record: Record<string, unknown>): number {
  return positiveNumber(record['context_length']) ?? FALLBACK_CONTEXT_WINDOW
}

export function readCapabilities(record: Record<string, unknown>): OpenRouterCapabilities {
  return {
    context: readContextLength(record),
    thinking: readThinking(record),
    images: readAcceptsImages(record),
    tools: readSupportsTools(record),
  }
}

/** Author prefix of an `author/slug` id, or the whole id when there is no slash. */
export function authorOf(modelId: string): string {
  const slash = modelId.indexOf('/')
  return slash > 0 ? modelId.slice(0, slash) : modelId
}
