/**
 * The providers this build knows how to talk to.
 *
 * A descriptor is display and addressing metadata only. Credentials live in the
 * agent directory and are read at request time, so a descriptor never carries a
 * secret.
 */

import { OPENCODE_GO_BASE_URL } from './opencode/endpoints'
import { OPENROUTER_BASE_URL } from './openrouter/endpoints'
import { CODEX_BASE_URL } from './codex/endpoints'
import { PROVIDER_ID as CODEX_PROVIDER_ID } from './codex/oauth/constants'

export type ProviderAuthKind = 'api_key' | 'oauth'

export interface ProviderDescriptor {
  id: string
  name: string
  baseUrl: string
  /** Shown under the name when no key is configured. */
  keyHint: string
  authKind: ProviderAuthKind
}

export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = [
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    baseUrl: OPENCODE_GO_BASE_URL,
    keyHint: 'Get a key from OpenCode',
    authKind: 'api_key',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: OPENROUTER_BASE_URL,
    keyHint: 'Get a key from openrouter.ai/keys',
    authKind: 'api_key',
  },
  {
    id: CODEX_PROVIDER_ID,
    name: 'OpenAI Codex',
    baseUrl: CODEX_BASE_URL,
    keyHint: 'ChatGPT Plus or Pro',
    authKind: 'oauth',
  },
]

export function findDescriptor(id: string): ProviderDescriptor | undefined {
  return PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === id)
}
