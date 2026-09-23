/**
 * TypeSafe addressing.
 *
 * TypeSafe holds a key and is not a chat catalog. Official evaluate lives at
 * POST /v1/systemone. Jev slugs on OpenRouter still have to be dropped from
 * the picker so they never show up as chat models.
 */

export const TYPESAFE_PROVIDER_ID = 'typesafe'

export const TYPESAFE_BASE_URL = 'https://api.typesafe.ai'

const OFFICIAL_JEV = /^jev-\d+(?:\.\d+)*$/

/** Completions cannot answer these. They belong on /v1/systemone. */
export function isJevModelId(id: string): boolean {
  if (id === '') return false
  const lower = id.toLowerCase()
  if (lower.startsWith('typesafe/jev') || lower.startsWith('~typesafe/jev')) return true
  return lower === 'jev-latest' || lower === 'jev-preview' || OFFICIAL_JEV.test(lower)
}
