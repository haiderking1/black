import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { abortableEvents } from '../../../backend/chat/streaming/lifecycle'
import { executeBash } from '../../../backend/tools/bash/runner'
import { tmpdir } from 'node:os'

test('consumer cancellation aborts a blocked bash invocation before closing the generator', async () => {
  const controller = new AbortController()
  let closed = false
  let childResult: Awaited<ReturnType<typeof executeBash>> | undefined
  let ready!: () => void
  const started = new Promise<void>(resolve => { ready = resolve })
  const events = (async function* () {
    try {
      yield 1
      childResult = await executeBash('echo ready; sleep 30', { cwd: tmpdir(), signal: controller.signal, onData: ready })
      yield 2
    } finally { closed = true }
  })()
  const buffered = Stream.fromAsyncIterable(abortableEvents(events, () => controller.abort()), error => error).pipe(Stream.buffer({ capacity: 64 }))
  try {
    const received = await Effect.runPromise(buffered.pipe(
      Stream.tap(() => Effect.promise(() => started)), Stream.take(1), Stream.runCollect,
    ))
    expect([...received]).toEqual([1])
    expect(controller.signal.aborted).toBe(true)
    expect(childResult?.aborted).toBe(true)
    expect(closed).toBe(true)
  } finally { controller.abort() }
}, 4000)
