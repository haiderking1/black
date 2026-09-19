import { expect, test } from 'bun:test'

import { lookupPassLimits, type ModelLimits } from './limits.ts'

const qwen: ModelLimits = {
  context: 1_000_000,
  thinking: { reasoning: true, kind: 'effort', levels: ['minimal', 'low', 'medium', 'high', 'xhigh'] },
  images: true,
  tools: true,
}

test('lookupPassLimits matches a ClinePass id, a prefixed slug, or a bare slug', () => {
  const byId = new Map([['cline-pass/qwen3.8-max', qwen]])
  expect(lookupPassLimits(byId, 'cline-pass/qwen3.8-max')).toEqual(qwen)
  expect(lookupPassLimits(byId, 'qwen3.8-max')).toEqual(qwen)

  const bySlug = new Map([['qwen3.8-max', qwen]])
  expect(lookupPassLimits(bySlug, 'cline-pass/qwen3.8-max')).toEqual(qwen)
  expect(lookupPassLimits(bySlug, 'missing')).toBeUndefined()
})
