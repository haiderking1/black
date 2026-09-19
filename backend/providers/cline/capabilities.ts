import type { ThinkingSupport } from '../types'

export const FALLBACK_CONTEXT_WINDOW = 128_000

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item !== '')
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

/**
 * Cline's OpenAI-shaped effort set.
 *
 * `/models` lists `reasoning_effort` and then omits `supported_efforts`.
 * Desktop uses this same list. models.dev's `cline-pass` rows do too.
 */
export const CLINE_REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'] as const

/**
 * Reasoning control published on one Cline catalog row.
 *
 * Cline marks thinking with `include_reasoning` or `reasoning`. Effort lists
 * are sent when the row publishes them. A row that only lists
 * `reasoning_effort` still takes Cline's effort set. A listed model with
 * neither still thinks with no control. `unknown` is only for models this
 * catalog never saw.
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

  if (parameters.includes('reasoning_effort')) {
    return { reasoning: true, kind: 'effort', levels: [...CLINE_REASONING_EFFORTS] }
  }

  const mentionsReasoning =
    parameters.includes('reasoning')
    || parameters.includes('include_reasoning')
    || (typeof reasoning === 'object' && reasoning !== null)
  if (mentionsReasoning) {
    return { reasoning: true, kind: 'none', levels: [] }
  }

  return { reasoning: false, kind: 'none', levels: [] }
}

export function readAcceptsImages(record: Record<string, unknown>): boolean {
  const architecture = record['architecture']
  if (typeof architecture !== 'object' || architecture === null) return false
  const arch = architecture as { modality?: unknown; input_modalities?: unknown }
  const modality = arch.modality
  if (Array.isArray(modality) && modality.includes('image')) return true
  if (typeof modality === 'string' && modality.includes('image')) return true
  const input = arch.input_modalities
  return Array.isArray(input) && input.includes('image')
}

export function readSupportsTools(record: Record<string, unknown>): boolean {
  return stringList(record['supported_parameters']).includes('tools')
}

export function readContextLength(record: Record<string, unknown>): number {
  return positiveNumber(record['context_length']) ?? FALLBACK_CONTEXT_WINDOW
}

export function readCapabilities(record: Record<string, unknown>): {
  context: number
  thinking: ThinkingSupport
  images: boolean
  tools: boolean
} {
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
