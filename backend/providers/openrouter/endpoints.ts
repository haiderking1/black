/**
 * OpenRouter addressing.
 *
 * One host, OpenAI-shaped paths. Model ids are `author/slug`, and the endpoints
 * list lives under that pair rather than under the id as a single segment.
 */

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export const MODELS_PATH = '/models'
export const CHAT_COMPLETIONS_PATH = '/chat/completions'

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const suffix = path.startsWith('/') ? path : '/' + path
  return base + suffix
}

/**
 * Path to the per-host list for one model.
 *
 * The first slash splits author from slug. Anything after that stays in the
 * slug, so a name with extra slashes is not silently truncated.
 */
export function endpointsPath(modelId: string): string {
  const slash = modelId.indexOf('/')
  if (slash <= 0 || slash === modelId.length - 1) {
    throw new Error('OpenRouter model ids are author/slug, not ' + JSON.stringify(modelId))
  }
  const author = encodeURIComponent(modelId.slice(0, slash))
  const slug = encodeURIComponent(modelId.slice(slash + 1))
  return '/models/' + author + '/' + slug + '/endpoints'
}
