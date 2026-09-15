import { expect, test } from 'bun:test'
import { createFramePublisher } from '../../../frontend/chat/conversations/publication'
import { createConversationPersistence, CONVERSATION_SAVE_INTERVAL_MS } from '../../../frontend/chat/conversations/persistence'
import type { Message } from '../../../frontend/chat/types'

function scheduler() {
  let nextId = 0
  const pending = new Map<number, () => void>()
  const delays: number[] = []
  return {
    pending, delays,
    schedule(task: () => void, delay = 0) {
      const id = nextId++
      pending.set(id, task); delays.push(delay)
      return () => { pending.delete(id) }
    },
    run() { for (const [id, task] of [...pending]) { pending.delete(id); task() } },
  }
}

test('coalesces publication without capturing a stale snapshot', () => {
  const clock = scheduler()
  let current = 0
  const published: number[] = []
  const publisher = createFramePublisher(() => published.push(current), clock.schedule)
  for (let index = 1; index <= 1000; index++) { current = index; publisher.schedule() }
  expect(clock.pending.size).toBe(1)
  expect(published).toEqual([])
  clock.run()
  expect(published).toEqual([1000])
  expect(clock.pending.size).toBe(0)
})

test('terminal flush publishes immediately and cancels the old callback', () => {
  const clock = scheduler()
  let calls = 0
  const publisher = createFramePublisher(() => calls++, clock.schedule)
  publisher.schedule(); publisher.flush(); publisher.flush(); clock.run()
  expect(calls).toBe(1)
  publisher.schedule(); clock.run()
  expect(calls).toBe(2)
})

test('unmount cancellation prevents a delayed React update', () => {
  const clock = scheduler()
  let calls = 0
  const publisher = createFramePublisher(() => calls++, clock.schedule)
  publisher.schedule(); publisher.cancel(); clock.run(); publisher.flush()
  expect(calls).toBe(0)
  publisher.schedule(); clock.run()
  expect(calls).toBe(1)
})

test('saves the latest state once per interval during uninterrupted streaming', () => {
  const clock = scheduler()
  let messages: Message[] = []
  const saved: number[] = []
  let reads = 0
  const persistence = createConversationPersistence(() => { reads++; return { session: messages } }, state => saved.push(state.session!.length), clock.schedule)
  for (let index = 0; index < 100; index++) { messages = [...messages, { id: String(index), role: 'user', content: 'x', timestamp: 'now' }]; persistence.schedule() }
  expect(clock.pending.size).toBe(1)
  expect(clock.delays).toEqual([CONVERSATION_SAVE_INTERVAL_MS])
  expect(reads).toBe(0)
  clock.run()
  expect(saved).toEqual([100])
  expect(reads).toBe(1)
  messages = []; persistence.schedule(); clock.run()
  expect(saved).toEqual([100, 0])
})

test('completion and lifecycle flushes save pending progress once, then accept new changes', () => {
  const clock = scheduler()
  let content = 'partial'
  const saved: string[] = []
  const persistence = createConversationPersistence(() => ({ session: [{ id: 'reply', role: 'assistant', content, timestamp: 'now' }] }), state => saved.push(state.session![0]!.content), clock.schedule)
  persistence.schedule(); content = 'finished'; persistence.flush(); persistence.flush(); clock.run()
  expect(saved).toEqual(['finished'])
  content = 'next'; persistence.schedule(); persistence.flush(); clock.run()
  expect(saved).toEqual(['finished', 'next'])
})
