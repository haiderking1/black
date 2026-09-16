export const CODEX_BASE_URL = 'https://chatgpt.com/backend-api'
export const CODEX_RESPONSES_PATH = '/codex/responses'
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

export const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64

export function clampPromptCacheKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined
  const chars = [...key]
  if (chars.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH) return key
  return chars.slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH).join('')
}
