import { describe, expect, it } from 'bun:test'

import { createOpenCodeProvider } from '../backend/providers/opencode'
import { OPENCODE_GO_BASE_URL } from '../backend/providers/opencode/endpoints'

/**
 * Live catalog check against the real Go endpoint.
 *
 * The model list endpoint needs no credentials, so this verifies the base URL,
 * the response shape, and the parser against the vendor rather than a fixture.
 * Inference calls are not exercised here because they need a key.
 */
describe('opencode go live catalog', () => {
  it('reads the real model list', async () => {
    const provider = createOpenCodeProvider({ apiKey: 'unused-for-catalog', ttlMs: 0 })

    const models = await provider.listModels()

    expect(provider.id).toBe('opencode-go')
    expect(OPENCODE_GO_BASE_URL).toBe('https://opencode.ai/zen/go/v1')
    expect(models.length).toBeGreaterThan(10)
    for (const model of models) {
      expect(typeof model.id).toBe('string')
      expect(model.id).not.toBe('')
    }
  }, 30_000)

  it('caches the catalog so a second call makes no request', async () => {
    let calls = 0
    const provider = createOpenCodeProvider({
      apiKey: 'unused',
      ttlMs: 60_000,
      fetchImpl: async (input, init) => {
        calls++
        return fetch(input, init)
      },
    })

    await provider.listModels()
    await provider.listModels()
    expect(calls).toBe(1)
  }, 30_000)
})
