/**
 * OpenRouter host routing.
 *
 * A model is served by more than one upstream. The request `provider` object
 * either ranks them (latency or throughput) or pins one tag. Tools also set
 * require_parameters so a host that cannot take the request is not selected.
 */

import type { ChatRoute, ModelEndpoint } from '../types'

export function routingBody(route: ChatRoute | undefined, hasTools: boolean): Record<string, unknown> {
  const extras = hasTools ? { require_parameters: true } : {}
  const only = route?.only?.trim()
  if (only !== undefined && only !== '') {
    return { only: [only], allow_fallbacks: false, ...extras }
  }
  return { sort: route?.sort ?? 'latency', ...extras }
}

function percentile(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || value === null) return undefined
  const p50 = (value as { p50?: unknown }).p50
  return typeof p50 === 'number' && Number.isFinite(p50) ? p50 : undefined
}

function tagOf(record: Record<string, unknown>): string | undefined {
  if (typeof record['tag'] === 'string' && record['tag'] !== '') return record['tag']
  if (typeof record['provider_name'] === 'string' && record['provider_name'] !== '') {
    return record['provider_name'].trim().toLowerCase().replace(/\s+/g, '-')
  }
  return undefined
}

function money(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value !== 'string' || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function discountOf(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value > 1 ? 1 : value
}

export function parseEndpoint(entry: unknown): ModelEndpoint | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined
  const record = entry as Record<string, unknown>
  const tag = tagOf(record)
  if (tag === undefined) return undefined

  const providerName = typeof record['provider_name'] === 'string' && record['provider_name'] !== ''
    ? record['provider_name']
    : tag
  const contextLength = typeof record['context_length'] === 'number' && Number.isFinite(record['context_length']) && record['context_length'] > 0
    ? Math.floor(record['context_length'])
    : 0
  const status = typeof record['status'] === 'number' && Number.isFinite(record['status']) ? record['status'] : 0
  const latencyMs = percentile(record['latency_last_30m'])
  const throughput = percentile(record['throughput_last_30m'])
  const uptime = typeof record['uptime_last_30m'] === 'number' && Number.isFinite(record['uptime_last_30m'])
    ? record['uptime_last_30m']
    : undefined
  const quantization = typeof record['quantization'] === 'string' && record['quantization'].trim() !== ''
    ? record['quantization'].trim()
    : undefined
  const pricing = typeof record['pricing'] === 'object' && record['pricing'] !== null
    ? record['pricing'] as Record<string, unknown>
    : undefined
  const promptPrice = money(pricing?.['prompt'])
  const completionPrice = money(pricing?.['completion'])
  const discount = discountOf(pricing?.['discount'])

  return {
    tag,
    providerName,
    contextLength,
    status,
    ...(latencyMs === undefined ? {} : { latencyMs }),
    ...(throughput === undefined ? {} : { throughput }),
    ...(uptime === undefined ? {} : { uptime }),
    ...(promptPrice === undefined ? {} : { promptPrice }),
    ...(completionPrice === undefined ? {} : { completionPrice }),
    ...(discount === undefined ? {} : { discount }),
    ...(quantization === undefined ? {} : { quantization }),
  }
}

/** Endpoints payload, whether wrapped in `data` or returned at the root. */
export function parseEndpoints(body: unknown): ModelEndpoint[] {
  if (typeof body !== 'object' || body === null) return []
  const root = body as { data?: unknown; endpoints?: unknown }
  const source = typeof root.data === 'object' && root.data !== null ? root.data as { endpoints?: unknown } : root
  if (!Array.isArray(source.endpoints)) return []

  const seen = new Set<string>()
  const endpoints: ModelEndpoint[] = []
  for (const entry of source.endpoints) {
    const parsed = parseEndpoint(entry)
    if (parsed === undefined || seen.has(parsed.tag)) continue
    seen.add(parsed.tag)
    endpoints.push(parsed)
  }
  return endpoints
}

export function pinnedContext(endpoints: readonly ModelEndpoint[], tag: string): number | undefined {
  const match = endpoints.find((endpoint) => endpoint.tag === tag)
  return match !== undefined && match.contextLength > 0 ? match.contextLength : undefined
}
