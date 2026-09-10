/**
 * OpenCode Zen endpoints.
 *
 * Zen exposes two base paths on the same host: the pay-as-you-go gateway and the
 * Go subscription. They differ only by base path, so the provider takes the base
 * as configuration and defaults to Go.
 */

/** OpenCode Go, the subscription tier. */
export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1'

/** OpenCode Zen, the pay-as-you-go gateway. */
export const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1'

export const MODELS_PATH = '/models'
export const CHAT_COMPLETIONS_PATH = '/chat/completions'

/** Join a base and a path without doubling or dropping the separator. */
export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const suffix = path.startsWith('/') ? path : '/' + path
  return base + suffix
}
