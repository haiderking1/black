/**
 * Model limits.
 *
 * The Go catalog reports ids and nothing else, so it cannot say how large a
 * context window a model has. Compaction needs that number to decide when to
 * fire, so it comes from models.dev, which publishes per-model limits and is the
 * catalog several agent harnesses already read.
 *
 * The provider key is probed rather than assumed: the catalog has appeared under
 * more than one name, and an id that is present in either should resolve.
 */

import { createTtlCache, type TtlCache } from '../cache'
import { ProviderError } from '../errors'
import type { FetchLike, ThinkingSupport } from '../types'

export const MODELS_DEV_URL = 'https://models.dev/api.json'

/** Limits change far less often than models are added. */
export const DEFAULT_LIMITS_TTL_MS = 60 * 60 * 1000

/**
 * Used when a model has no published limit. Deliberately conservative: assuming
 * a smaller window compacts early, which is recoverable, rather than
 * overflowing, which is not.
 */
export const FALLBACK_CONTEXT_WINDOW = 128_000

export interface ModelLimits {
  /** Total context window in tokens. */
  context: number
  /** Cap on generated tokens, when published. */
  output?: number
  /** How the model exposes reasoning control. */
  thinking: ThinkingSupport
}

export type { ThinkingSupport } from '../types'

export interface LimitsOptions {
  fetchImpl?: FetchLike
  ttlMs?: number
  now?: () => number
  /** Provider keys to probe, in order. */
  providerKeys?: string[]
}

export interface LimitsSource {
  /** Limits for one model, or undefined when unpublished. */
  get(modelId: string): Promise<ModelLimits | undefined>
  /** Limits for a model, falling back to a safe window when unpublished. */
  contextWindowFor(modelId: string): Promise<number>
  /**
   * Reasoning support for a model. A model absent from the catalog reports
   * 'unknown' rather than a guess, so nothing is sent for it.
   */
  thinkingFor(modelId: string): Promise<ThinkingSupport>
  /** Every known limit, keyed by model id. */
  all(): Promise<Map<string, ModelLimits>>
  refresh(): Promise<Map<string, ModelLimits>>
}

const DEFAULT_PROVIDER_KEYS = ['opencode', 'opencode-go', 'opencode-zen']

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

/**
 * Interpret a model's reasoning_options.
 *
 * The field is a list of capabilities that may be absent, empty, or a mix of
 * an effort list, a bare toggle, and a token budget. Only the effort list maps
 * onto a value we can send.
 */
function readThinking(value: Record<string, unknown>): ThinkingSupport {
  const reasoning = value['reasoning'] === true
  const options = value['reasoning_options']

  if (!Array.isArray(options)) {
    return { reasoning, kind: reasoning ? 'none' : 'none', levels: [] }
  }

  let kind: ThinkingSupport['kind'] = 'none'
  let levels: string[] = []

  for (const option of options) {
    if (typeof option !== 'object' || option === null) continue
    const type = (option as { type?: unknown }).type
    if (type === 'effort') {
      const values = (option as { values?: unknown }).values
      if (Array.isArray(values)) {
        const usable = values.filter((v): v is string => typeof v === 'string' && v !== '')
        if (usable.length > 0) {
          kind = 'effort'
          levels = usable
        }
      }
    } else if (type === 'toggle' && kind === 'none') {
      kind = 'toggle'
    }
  }

  return { reasoning, kind, levels }
}

/** Read one provider's models into the flat map we care about. */
function readProvider(entry: unknown, into: Map<string, ModelLimits>): void {
  if (typeof entry !== 'object' || entry === null) return
  const models = (entry as { models?: unknown }).models
  if (typeof models !== 'object' || models === null) return

  for (const [modelId, value] of Object.entries(models as Record<string, unknown>)) {
    if (modelId === '' || into.has(modelId)) continue
    if (typeof value !== 'object' || value === null) continue
    const record = value as Record<string, unknown>
    const limit = record['limit']
    if (typeof limit !== 'object' || limit === null) continue

    const context = positiveNumber((limit as { context?: unknown }).context)
    if (context === undefined) continue

    const output = positiveNumber((limit as { output?: unknown }).output)
    const thinking = readThinking(record)
    into.set(modelId, output !== undefined ? { context, output, thinking } : { context, thinking })
  }
}

export function createLimitsSource(options: LimitsOptions = {}): LimitsSource {
  const doFetch = options.fetchImpl ?? fetch
  const providerKeys = options.providerKeys ?? DEFAULT_PROVIDER_KEYS

  const load = async (): Promise<Map<string, ModelLimits>> => {
    let response: Response
    try {
      response = await doFetch(MODELS_DEV_URL)
    } catch (error) {
      throw new ProviderError('opencode-go', 'network', error instanceof Error ? error.message : String(error))
    }

    if (!response.ok) {
      throw new ProviderError(
        'opencode-go',
        'server',
        'Model limits request failed with status ' + response.status,
        response.status,
      )
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ProviderError('opencode-go', 'malformed_response', 'Model limits were not JSON')
    }

    if (typeof body !== 'object' || body === null) {
      throw new ProviderError('opencode-go', 'malformed_response', 'Model limits were not an object')
    }

    const catalog = body as Record<string, unknown>
    const limits = new Map<string, ModelLimits>()
    for (const key of providerKeys) readProvider(catalog[key], limits)

    if (limits.size === 0) {
      throw new ProviderError('opencode-go', 'malformed_response', 'No model limits found for this provider')
    }
    return limits
  }

  const cache: TtlCache<Map<string, ModelLimits>> = createTtlCache(load, {
    ttlMs: options.ttlMs ?? DEFAULT_LIMITS_TTL_MS,
    ...(options.now !== undefined ? { now: options.now } : {}),
  })

  return {
    get: async (modelId) => (await cache.get()).get(modelId),
    contextWindowFor: async (modelId) => (await cache.get()).get(modelId)?.context ?? FALLBACK_CONTEXT_WINDOW,
    thinkingFor: async (modelId) =>
      (await cache.get()).get(modelId)?.thinking ?? { reasoning: false, kind: 'unknown', levels: [] },
    all: () => cache.get(),
    refresh: () => cache.refresh(),
  }
}
