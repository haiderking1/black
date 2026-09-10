import { describe, expect, it } from 'bun:test'
import * as Stream from 'effect/Stream'
import { splitWork, workIsExpanded } from '../../frontend/working/model'
import { applyWorkEvent, finishWork } from '../../frontend/working/reducer'
import { consumeWork } from '../../frontend/working/consume'
import { isRunning } from '../../frontend/chat/toolRun'
import { fresh, rounds, replay, call } from './fixtures'

it('preserves interleaved text, reasoning and multiple tool rounds; streams final text separately', () => {
  const message = replay(rounds)
  expect(message.content).toBe('Final answer.')
  const split = splitWork(message.work!)
  expect(split.activity.map(p => p.type)).toEqual(['text', 'thinking', 'text', 'tools', 'thinking', 'text', 'tools', 'thinking'])
  expect(message.work?.parts.filter(p => p.type === 'text').map(p => p.text)).toEqual(['First progress.', 'Before read.', 'Second progress.', 'Final answer.'])
  expect(message.work?.elapsedMs).toBe(1300)
  expect(replay(rounds.slice(0, 11)).content).toBe('Final ')
  expect(split.activity.filter(p => p.type === 'thinking').every(p => p.durationMs !== undefined)).toBe(true)
})

it('classifies earlier text as activity only when subsequent activity actually arrives', () => {
  const first = replay([{ type: 'text', round: 0, text: 'Checking.' }])
  expect(first.content).toBe('Checking.')
  expect(splitWork(first.work!).activity).toEqual([])
  const next = applyWorkEvent(first, { type: 'tool_calls', round: 0, toolCalls: [call()] }, 1300)
  expect(next.content).toBe('')
  expect(splitWork(next.work!).activity.map(p => p.type)).toEqual(['text', 'tools'])
  const interleaved = replay([{ type: 'text', round: 0, text: 'Progress' }, { type: 'thinking', round: 0, text: 'Reason' }, { type: 'text', round: 0, text: 'Answer' }])
  expect(splitWork(interleaved.work!).activity.map(p => p.type)).toEqual(['text', 'thinking'])
  expect(interleaved.content).toBe('Answer')
})

it('scopes repeated provider tool ids by the explicit round', () => {
  const m = replay([
    { type: 'tool_calls', round: 0, toolCalls: [call()] },
    { type: 'tool_result', round: 0, toolCallId: 'read', toolResult: 'one' },
    { type: 'tool_calls', round: 1, toolCalls: [call()] },
    { type: 'tool_result', round: 1, toolCallId: 'read', toolResult: 'two' }
  ])
  expect(m.work?.parts.flatMap(p => p.type === 'tools' ? p.runs.map(r => r.result) : [])).toEqual(['one', 'two'])
})

for (const [stopReason, status] of [['aborted', 'stopped'], ['length', 'incomplete'], ['error', 'failed']] as const) {
  it('settles ' + stopReason + ' without losing partial text or leaving pending tools', () => {
    const m = replay([...rounds.slice(0, 4), { type: 'done', stopReason }])
    expect(m.work?.status).toBe(status)
    const runs = m.work!.parts.flatMap(p => p.type === 'tools' ? p.runs : [])
    expect(runs.every(r => !isRunning(r))).toBe(true)
    expect(splitWork(m.work!).activity[0]).toMatchObject({ text: 'First progress.' })
    expect(finishWork(m, 'completed', 9000)).toBe(m)
  })
}

it('keeps partial answers on provider errors and ignores events after terminal status', () => {
  const m = replay([{ type: 'text', round: 0, text: 'Partial' }, { type: 'error', message: 'Provider failed' }])
  expect(m.content).toBe('Partial')
  expect(m.work?.error).toBe('Provider failed')
  expect(applyWorkEvent(m, { type: 'done', stopReason: 'stop' }, 5000)).toBe(m)
})

it('settles clean EOF and rejected transport as interrupted', async () => {
  for (const events of [Stream.make({ type: 'text' as const, round: 0, text: 'Partial' }), Stream.fail(new Error('Offline'))]) {
    let message = fresh()
    await consumeWork(events, update => { message = update(message) }, () => 1700)
    expect(message.work?.status).toBe('interrupted')
    expect(message.work?.elapsedMs).toBe(700)
    expect(message.work?.error).toBeTruthy()
  }
})

it('never auto-collapses, and keeps explicit choices through streaming and completion', () => {
  expect(workIsExpanded({})).toBe(false)
  for (const expanded of [true, false]) {
    let m = fresh()
    m = { ...m, work: { ...m.work!, expanded } }
    for (const event of rounds) m = applyWorkEvent(m, event, 1500)
    expect(workIsExpanded(m.work!)).toBe(expanded)
  }
})
