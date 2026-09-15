import { expect, test } from 'bun:test'
import { verifiedThinkingRequest } from '../../backend/providers/thinking/validate'

test('passes only published effort values for the exact model', async () => {
  const request = { model: 'new-model', reasoningEffort: 'vendor-specific' }
  expect(await verifiedThinkingRequest(request, async model => {
    expect(model).toBe('new-model')
    return { reasoning: true, kind: 'effort', levels: ['vendor-specific'] }
  })).toBe(request)
  expect(await verifiedThinkingRequest(request, async () => ({ reasoning: true, kind: 'effort', levels: ['low'] }))).toEqual({ model: 'new-model' })
  expect(request.reasoningEffort).toBe('vendor-specific')
})

test('unknown, toggle, missing levels and outages omit saved effort values', async () => {
  for (const kind of ['unknown', 'toggle', 'none', 'effort'] as const) {
    expect(await verifiedThinkingRequest({ model: 'unlisted', reasoningEffort: 'max' }, async () => ({ reasoning: true, kind, levels: [] }))).toEqual({ model: 'unlisted' })
  }
  expect(await verifiedThinkingRequest({ model: 'unlisted', reasoningEffort: 'max' }, async () => { throw new Error('offline') })).toEqual({ model: 'unlisted' })
})

test('default requests do not need a metadata lookup', async () => {
  for (const reasoningEffort of [undefined, 'default', 'off']) {
    const result = await verifiedThinkingRequest({ model: 'any', reasoningEffort }, async () => { throw new Error('must not be called') })
    expect(result.reasoningEffort).toBeUndefined()
  }
})

test('cancellation does not wait for a hung capability lookup', async () => {
  const controller = new AbortController()
  const pending = verifiedThinkingRequest({ model: 'any', reasoningEffort: 'max', signal: controller.signal }, () => new Promise(() => {}))
  controller.abort()
  expect((await pending).reasoningEffort).toBeUndefined()
})
