import type { ModelEndpoint } from '../../../contracts/providers'

export interface AutoRouteChoice {
  title: string
  note: string
}

/**
 * Hosts matching a query.
 *
 * Name, OpenRouter tag, and quantization are all searchable, so "groq" or
 * "fp8" lands on the same rows the stats line already shows.
 */
export function filterHosts(
  endpoints: readonly ModelEndpoint[],
  query: string,
): readonly ModelEndpoint[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return endpoints

  return endpoints.filter((endpoint) => {
    if (endpoint.providerName.toLowerCase().includes(needle)) return true
    if (endpoint.tag.toLowerCase().includes(needle)) return true
    const quant = endpoint.quantization
    return quant !== undefined && quant.toLowerCase().includes(needle)
  })
}

/** Fastest / Throughput stay in the list when the query names them. */
export function filterAuto<T extends AutoRouteChoice>(
  choices: readonly T[],
  query: string,
): readonly T[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return choices

  return choices.filter(
    (choice) =>
      choice.title.toLowerCase().includes(needle) || choice.note.toLowerCase().includes(needle),
  )
}
