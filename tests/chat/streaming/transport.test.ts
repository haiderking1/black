import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

test('bounded transport buffering cancels its producer when consumption stops', async () => {
  let produced = 0
  let closed = false
  const events = (async function* () {
    try { while (produced < 1000) yield produced++ } finally { closed = true }
  })()
  const received = await Effect.runPromise(Stream.runCollect(
    Stream.fromAsyncIterable(events, error => error).pipe(Stream.buffer({ capacity: 64 }), Stream.take(5))
  ))
  expect([...received]).toEqual([0, 1, 2, 3, 4])
  expect(closed).toBe(true)
  expect(produced).toBeLessThanOrEqual(70)
})
