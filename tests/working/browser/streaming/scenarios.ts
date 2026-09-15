import * as Stream from 'effect/Stream'
import type { ChatStreamEvent } from '../../../../contracts/chat'
import { consumeWork } from '../../../../frontend/working/consume'
import { applyWorkEvent } from '../../../../frontend/working/reducer'
import { mountStreamingFixture } from './fixture'

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
const settle = () => new Promise(resolve => setTimeout(resolve, 60))

export async function runStreamingScenarios(): Promise<string[]> {
  const passed: string[] = []
  const fixture = await mountStreamingFixture()
  const channel = new MessageChannel()
  const task = () => new Promise<void>(resolve => { channel.port1.onmessage = () => resolve(); channel.port2.postMessage(null) })
  try {
    const count = 600
    let expected = ''
    const events = (async function* (): AsyncGenerator<ChatStreamEvent> {
      for (let index = 0; index < count; index++) {
        const text = String(index) + ', '
        expected += text
        yield { type: 'text', text, round: 0 }
        // Each delta arrives in its own browser task, like socket messages.
        await task()
        assert(fixture.current().content === expected, 'In-memory progress lagged behind received events')
        if (index === 100) fixture.patch(message => ({ ...message, work: { ...message.work!, expanded: true } }))
      }
      yield { type: 'done', stopReason: 'stop' }
    })()
    await consumeWork(Stream.fromAsyncIterable(events, error => error), fixture.patch)
    assert(fixture.current().content === expected, 'The final answer lost text')
    assert(fixture.persisted().content === expected, 'Completion did not save the final answer immediately')
    assert(fixture.persisted().work?.status === 'completed', 'Completion was not saved')
    assert(fixture.current().work?.expanded === true, 'Streaming replaced a manual expansion choice')
    await settle()
    const { saves, commits } = fixture.metrics()
    assert(commits > 0 && commits < count / 2, 'Stream still renders approximately once per delta: ' + commits)
    assert(saves > 0 && saves < count / 10, 'Stream still saves approximately once per delta: ' + saves)
    passed.push('streaming updates memory immediately while batching renders and saves')
  } finally { channel.port1.close(); channel.port2.close(); fixture.cleanup() }

  for (const [ending, status] of [
    [[{ type: 'done', stopReason: 'aborted' }], 'stopped'],
    [[{ type: 'error', message: 'fixture failure' }], 'failed'],
    [[], 'interrupted'],
  ] as Array<[ChatStreamEvent[], string]>) {
    const terminal = await mountStreamingFixture()
    try {
      await consumeWork(Stream.fromIterable<ChatStreamEvent>([{ type: 'text', text: 'partial' }, ...ending]), terminal.patch)
      assert(terminal.persisted().content === 'partial', status + ' lost pending text')
      assert(terminal.persisted().work?.status === status, status + ' did not flush immediately')
      assert(terminal.metrics().saves === 1, status + ' wrote redundant snapshots')
    } finally { terminal.cleanup() }
  }
  passed.push('Stop, errors and interrupted streams persist their final state immediately')

  const lifecycle = await mountStreamingFixture()
  try {
    lifecycle.patch(message => applyWorkEvent(message, { type: 'text', text: 'before hiding' }, 1100))
    window.dispatchEvent(new Event('pagehide'))
    assert(lifecycle.persisted().content === 'before hiding', 'Page hide lost pending progress')
    lifecycle.patch(message => applyWorkEvent(message, { type: 'text', text: ' and unmounting' }, 1200))
    lifecycle.unmount()
    assert(lifecycle.persisted().content === 'before hiding and unmounting', 'Unmount lost pending progress')
    const saves = lifecycle.metrics().saves
    await settle()
    assert(lifecycle.metrics().saves === saves, 'A cancelled save fired after unmount')
  } finally { lifecycle.cleanup() }
  passed.push('page hide and unmount flush unsaved progress without leaving timers')
  return passed
}
