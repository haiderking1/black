import { describe, expect, it } from 'bun:test'

import { activeProviderId, pickerRail } from '../frontend/settings/activeProvider'
import type { ProviderStatus } from '../contracts/providers'

function status(id: string, flags: Partial<ProviderStatus> = {}): ProviderStatus {
  return {
    id,
    name: id,
    baseUrl: 'https://example.test',
    enabled: true,
    authenticated: true,
    modelCount: 1,
    ...flags,
  }
}

describe('activeProviderId', () => {
  const both = [status('opencode-go'), status('openrouter')]

  it('keeps a saved authenticated provider', () => {
    expect(activeProviderId('openrouter', both)).toBe('openrouter')
  })

  it('keeps a saved provider that is enabled but has no key, so the rail can switch to it', () => {
    expect(activeProviderId('openrouter', [
      status('opencode-go'),
      status('openrouter', { authenticated: false }),
    ])).toBe('openrouter')
  })

  it('falls back when the saved provider is disabled', () => {
    expect(activeProviderId('openrouter', [
      status('opencode-go'),
      status('openrouter', { enabled: false }),
    ])).toBe('opencode-go')
  })

  it('uses OpenCode Go when nothing is usable', () => {
    expect(activeProviderId(null, [])).toBe('opencode-go')
  })

  it('keeps a saved provider while the status list has not loaded', () => {
    expect(activeProviderId('openrouter', [])).toBe('openrouter')
  })
})

describe('pickerRail', () => {
  it('lists enabled providers even when OpenRouter has no key', () => {
    expect(
      pickerRail([
        status('opencode-go'),
        status('openrouter', { authenticated: false }),
        status('hidden', { enabled: false, authenticated: true }),
      ]),
    ).toEqual([
      { id: 'opencode-go', name: 'opencode-go' },
      { id: 'openrouter', name: 'openrouter' },
    ])
  })

  it('keeps Jev off the rail even when TypeSafe is enabled and keyed', () => {
    expect(
      pickerRail([
        status('opencode-go'),
        status('typesafe', { role: 'service' }),
      ]),
    ).toEqual([{ id: 'opencode-go', name: 'opencode-go' }])
  })
})

describe('activeProviderId with Jev', () => {
  it('does not pick TypeSafe as the chat provider', () => {
    expect(activeProviderId('typesafe', [
      status('typesafe', { role: 'service' }),
      status('opencode-go'),
    ])).toBe('opencode-go')
  })
})
