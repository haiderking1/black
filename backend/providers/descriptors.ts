/**
 * The providers this build knows how to talk to.
 *
 * A descriptor is display and addressing metadata only. Credentials live in the
 * agent directory and are read at request time, so a descriptor never carries a
 * secret.
 */

import { OPENCODE_GO_BASE_URL } from './opencode/endpoints'

export interface ProviderDescriptor {
  id: string
  name: string
  baseUrl: string
  /** Shown under the name when no key is configured. */
  keyHint: string
}

export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = [
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    baseUrl: OPENCODE_GO_BASE_URL,
    keyHint: 'Get a key from OpenCode',
  },
]

export function findDescriptor(id: string): ProviderDescriptor | undefined {
  return PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === id)
}
