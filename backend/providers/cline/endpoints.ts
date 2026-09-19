/**
 * Cline addressing.
 *
 * Auth, catalog, and chat all live on api.cline.bot. The catalog is
 * `/api/v1/ai/cline/models`, not the OpenAI `/models` path.
 */

export const CLINE_API_BASE_URL = 'https://api.cline.bot'
export const CLINE_CHAT_BASE_URL = CLINE_API_BASE_URL

export const MODELS_PATH = '/api/v1/ai/cline/models'
export const RECOMMENDED_MODELS_PATH = '/api/v1/ai/cline/recommended-models'
export const CHAT_COMPLETIONS_PATH = '/api/v1/chat/completions'

export const AUTHORIZE_PATH = '/api/v1/auth/authorize'
export const TOKEN_PATH = '/api/v1/auth/token'
export const REFRESH_PATH = '/api/v1/auth/refresh'

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const suffix = path.startsWith('/') ? path : '/' + path
  return base + suffix
}
