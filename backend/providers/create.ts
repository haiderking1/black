/**
 * Build a provider from an id and a key.
 *
 * Chat and settings both construct providers at request time. One switch keeps
 * those sites from drifting when a vendor is added.
 */

import { createOpenCodeProvider } from './opencode'
import { createOpenRouterProvider } from './openrouter'
import { createClineProvider } from './cline'
import { createCodexProvider } from './codex'
import type { Provider } from './types'

export function createProvider(providerId: string, apiKey: string): Provider | undefined {
  if (providerId === 'opencode-go') return createOpenCodeProvider({ apiKey })
  if (providerId === 'openrouter') return createOpenRouterProvider({ apiKey })
  if (providerId === 'openai-codex') return createCodexProvider({ apiKey })
  if (providerId === 'cline') return createClineProvider({ apiKey })
  return undefined
}
