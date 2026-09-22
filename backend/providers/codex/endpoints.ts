export const CODEX_BASE_URL = 'https://chatgpt.com/backend-api'
export const CODEX_RESPONSES_PATH = '/codex/responses'
export const CODEX_MODELS_PATH = '/codex/models'
export const OPENAI_BETA_RESPONSES = 'responses=experimental'

export function joinUrl(base: string, path: string): string {
  const normalized = base.replace(/\/+$/, '')
  if (path === '') return normalized
  return normalized + (path.startsWith('/') ? path : '/' + path)
}

export function resolveCodexUrl(baseUrl?: string): string {
  const raw = baseUrl !== undefined && baseUrl.trim() !== '' ? baseUrl : CODEX_BASE_URL
  const normalized = raw.replace(/\/+$/, '')
  if (normalized.endsWith('/codex/responses')) return normalized
  if (normalized.endsWith('/codex')) return normalized + '/responses'
  return normalized + CODEX_RESPONSES_PATH
}

export function resolveCodexModelsUrl(baseUrl?: string): string {
  const raw = baseUrl !== undefined && baseUrl.trim() !== '' ? baseUrl : CODEX_BASE_URL
  const normalized = raw.replace(/\/+$/, '')
  if (normalized.endsWith('/codex/responses')) return normalized.slice(0, -'/responses'.length) + '/models'
  if (normalized.endsWith('/codex')) return normalized + '/models'
  return normalized + CODEX_MODELS_PATH
}

export function resolveCodexUsageUrl(baseUrl?: string): string {
  const raw = baseUrl !== undefined && baseUrl.trim() !== '' ? baseUrl : CODEX_BASE_URL
  const normalized = raw.replace(/\/+$/, '')
  const apiBase = normalized.endsWith('/codex/responses')
    ? normalized.slice(0, -'/codex/responses'.length)
    : normalized.endsWith('/codex')
      ? normalized.slice(0, -'/codex'.length)
      : normalized
  return apiBase + '/wham/usage'
}

export const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64

export function clampPromptCacheKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined
  const chars = [...key]
  if (chars.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH) return key
  return chars.slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH).join('')
}
