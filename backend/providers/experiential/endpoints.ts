export const EXPERIENTIAL_PROVIDER_ID = 'experiential'
export const EXPERIENTIAL_BASE_URL = 'https://api.experientiallabs.ai/v1'
export const EXPERIENTIAL_CATALOG_URL = 'https://api.experientiallabs.ai/api/models'
export const EXPERIENTIAL_RESPONSES_PATH = '/responses'

export function joinExperientialUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '')
  return normalizedBase + (path.startsWith('/') ? path : '/' + path)
}

/** Jev is a decision model: /v1/systemone, not chat completions. */
export function isChatModel(id: string): boolean {
  const slug = id.toLowerCase().split('/').at(-1) ?? ''
  return !/^jev(?:-|$)/.test(slug) && id.trim() !== ''
}
