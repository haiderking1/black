/**
 * The providers this build knows how to talk to.
 *
 * A descriptor is display and addressing metadata only. Credentials live in the
 * agent directory and are read at request time, so a descriptor never carries a
 * secret.
 */

import { TYPESAFE_BASE_URL, TYPESAFE_PROVIDER_ID } from './typesafe/endpoints'
import { EXPERIENTIAL_BASE_URL, EXPERIENTIAL_PROVIDER_ID } from './experiential/endpoints'
import { OPENCODE_GO_BASE_URL } from './opencode/endpoints'
import { OPENROUTER_BASE_URL } from './openrouter/endpoints'
import { CLINE_API_BASE_URL } from './cline/endpoints'
import { PROVIDER_ID as CLINE_PROVIDER_ID } from './cline/oauth/constants'
import { CODEX_BASE_URL } from './codex/endpoints'
import { PROVIDER_ID as CODEX_PROVIDER_ID } from './codex/oauth/constants'

export type ProviderAuthKind = 'api_key' | 'oauth'

/** Chat providers feed the model picker. A service only holds a key. */
export type ProviderRole = 'chat' | 'service'

export interface ProviderDescriptor {
  id: string
  name: string
  baseUrl: string
  /** Shown under the name when no key is configured. */
  keyHint: string
  authKind: ProviderAuthKind
  role: ProviderRole
}

export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = [
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    baseUrl: OPENCODE_GO_BASE_URL,
    keyHint: 'Get a key from OpenCode',
    authKind: 'api_key',
    role: 'chat',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: OPENROUTER_BASE_URL,
    keyHint: 'Get a key from openrouter.ai/keys',
    authKind: 'api_key',
    role: 'chat',
  },
  {
    id: CODEX_PROVIDER_ID,
    name: 'OpenAI Codex',
    baseUrl: CODEX_BASE_URL,
    keyHint: 'ChatGPT Plus or Pro',
    authKind: 'oauth',
    role: 'chat',
  },
  {
    id: CLINE_PROVIDER_ID,
    name: 'ClinePass',
    baseUrl: CLINE_API_BASE_URL,
    keyHint: 'ClinePass subscription',
    authKind: 'oauth',
    role: 'chat',
  },
  {
    id: EXPERIENTIAL_PROVIDER_ID,
    name: 'Experiential Labs',
    baseUrl: EXPERIENTIAL_BASE_URL,
    keyHint: 'Get a key from platform.experientiallabs.ai/settings/api-keys',
    authKind: 'api_key',
    role: 'chat',
  },
  {
    id: TYPESAFE_PROVIDER_ID,
    name: 'Jev',
    baseUrl: TYPESAFE_BASE_URL,
    keyHint: 'Get a key from console.typesafe.ai/settings/keys',
    authKind: 'api_key',
    role: 'service',
  },
]

export function findDescriptor(id: string): ProviderDescriptor | undefined {
  return PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === id)
}
