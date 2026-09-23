import { describe, expect, it } from 'bun:test'

import { createProvider } from '../backend/providers/create'
import { PROVIDER_DESCRIPTORS } from '../backend/providers/descriptors'
import { TYPESAFE_BASE_URL, TYPESAFE_PROVIDER_ID } from '../backend/providers/typesafe/endpoints'

describe('TypeSafe descriptor', () => {
  it('registers Jev as a key-only service pointed at api.typesafe.ai', () => {
    const descriptor = PROVIDER_DESCRIPTORS.find((entry) => entry.id === TYPESAFE_PROVIDER_ID)
    expect(descriptor).toMatchObject({
      id: 'typesafe',
      name: 'Jev',
      authKind: 'api_key',
      role: 'service',
      baseUrl: TYPESAFE_BASE_URL,
    })
    expect(createProvider('typesafe', 'k')).toBeUndefined()
    expect(PROVIDER_DESCRIPTORS.filter((entry) => entry.role === 'chat').every((entry) => entry.id !== 'typesafe')).toBe(true)
  })
})
