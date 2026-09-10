import { expect, it } from 'bun:test'
import * as Stream from 'effect/Stream'
import { createStreamingClient } from '../../backend/providers/opencode/stream'
import { runToolLoop } from '../../backend/chat/toolLoop'
import { consumeWork } from '../../frontend/working/consume'
import { turnHistory } from '../../frontend/working/history'
import { extractStreamParts } from '../../backend/providers/opencode/reasoning'
import { fresh } from './fixtures'

const frame = (delta: unknown, finish_reason: string | null = null) => 'data: ' + JSON.stringify({ choices: [{ delta, finish_reason }] }) + '\n\n'

it('keeps array block order, choosing reasoning before text only for unordered sibling channels', () => {
  expect(extractStreamParts({ content: [{ type: 'text', text: 'a' }, { type: 'thinking', thinking: 'b' }, { type: 'text', text: 'c' }] })).toEqual([
    { type: 'text', text: 'a' }, { type: 'thinking', text: 'b' }, { type: 'text', text: 'c' }
  ])
  expect(extractStreamParts({ content: 'answer', reasoning_content: 'reason' }).map(p => p.type)).toEqual(['thinking', 'text'])
})

it('runs actual SSE decoding, repeated tool rounds and client consumption offline', async () => {
  const bodies: Array<{ messages: Array<Record<string, unknown>> }> = []
  const responses = [
    frame({ content: [{ type: 'text', text: 'Before.' }, { type: 'thinking', thinking: 'Reason.' }, { type: 'text', text: 'Checking.' }] }) +
    frame({ tool_calls: [{ index: 0, id: 'same', function: { name: 'unknown', arguments: '{}' } }] }, 'tool_calls'),
    frame({ reasoning_content: 'Again.' }) + frame({ content: 'Second.' }) +
    frame({ tool_calls: [{ index: 0, id: 'same', function: { name: 'unknown', arguments: '{}' } }] }, 'tool_calls'),
    frame({ content: 'Final ' }) + frame({ content: 'answer.' }, 'stop')
  ]
  const provider = createStreamingClient({ baseUrl: 'https://offline.invalid', apiKey: 'fixture', fetchImpl: async (_, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    return new Response(responses.shift(), { headers: { 'Content-Type': 'text/event-stream' } })
  } })
  const events = runToolLoop({ messages: [], cwd: '', stream: messages => provider.stream({ model: 'fixture', messages }) })
  let message = fresh()
  await consumeWork(Stream.fromAsyncIterable(events, e => e), update => { message = update(message) }, () => 2000)
  expect(message.content).toBe('Final answer.')
  expect(message.work?.status).toBe('completed')
  expect(message.work?.parts.map(p => p.type)).toEqual(['text', 'thinking', 'text', 'tools', 'thinking', 'text', 'tools', 'text'])
  expect(message.work?.parts.flatMap(p => p.type === 'tools' ? p.runs.map(r => r.isError) : [])).toEqual([true, true])
  expect(bodies[1]?.messages[0]).toMatchObject({ role: 'assistant', content: 'Before.Checking.', tool_calls: [{ id: 'same' }] })
  expect(bodies[2]?.messages.map(m => m.role)).toEqual(['assistant', 'tool', 'assistant', 'tool'])
  expect(turnHistory(message).filter(m => m.role === 'assistant').map(m => m.content)).toEqual(['Before.Checking.', 'Second.', 'Final answer.'])
})

it('reports truncated provider EOF rather than completing a partial answer', async () => {
  const provider = createStreamingClient({ baseUrl: 'https://offline.invalid', apiKey: 'fixture', fetchImpl: async () => new Response(frame({ content: 'Partial' })) })
  const events = []
  for await (const e of provider.stream({ model: 'fixture', messages: [] })) events.push(e)
  expect(events.map(e => e.type)).toEqual(['text', 'error'])
})
