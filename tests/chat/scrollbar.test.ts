import { expect, test } from 'bun:test'
import { scrollbarSize } from '../../frontend/chat/floating-composer/scrollbar'

test('reads the occupied bar and ignores overlay or inverted boxes', () => {
  expect(scrollbarSize({ offsetWidth: 800, clientWidth: 785 })).toBe(15)
  expect(scrollbarSize({ offsetWidth: 800, clientWidth: 800 })).toBe(0)
  expect(scrollbarSize({ offsetWidth: 100, clientWidth: 140 })).toBe(0)
})
