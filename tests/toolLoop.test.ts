import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ToolCallAccumulator } from '../backend/providers/opencode/toolCalls'
import { parseToolArguments } from '../backend/tools/parseArguments'
import { runToolLoop } from '../backend/chat/toolLoop'
import type { ChatMessage, ChatStreamEvent, ToolCall } from '../backend/providers/types'

describe('ToolCallAccumulator', () => {
  it('rebuilds a call from argument fragments', () => {
    // This is the shape the wire actually sends: the name up front, then the
    // argument string a few characters at a time.
    const accumulator = new ToolCallAccumulator()
    accumulator.add([{ index: 0, id: 'call_1', type: 'function', function: { name: 'read', arguments: '' } }])
    accumulator.add([{ index: 0, function: { arguments: '{"pa' } }])
    accumulator.add([{ index: 0, function: { arguments: 'th": "a' } }])
    accumulator.add([{ index: 0, function: { arguments: '.ts"}' } }])

    expect(accumulator.calls()).toEqual([{ id: 'call_1', name: 'read', arguments: '{"path": "a.ts"}' }])
  })

  it('keeps several calls apart by index', () => {
    const accumulator = new ToolCallAccumulator()
    accumulator.add([
      { index: 0, id: 'a', function: { name: 'read', arguments: '{"path":"x"' } },
      { index: 1, id: 'b', function: { name: 'write', arguments: '{"path":"y"' } }
    ])
    accumulator.add([
      { index: 0, function: { arguments: '}' } },
      { index: 1, function: { arguments: '}' } }
    ])

    expect(accumulator.calls()).toEqual([
      { id: 'a', name: 'read', arguments: '{"path":"x"}' },
      { id: 'b', name: 'write', arguments: '{"path":"y"}' }
    ])
  })

  it('returns calls in index order even when fragments interleave', () => {
    const accumulator = new ToolCallAccumulator()
    accumulator.add([{ index: 1, id: 'b', function: { name: 'write', arguments: '' } }])
    accumulator.add([{ index: 0, id: 'a', function: { name: 'read', arguments: '' } }])
    expect(accumulator.calls().map((call) => call.id)).toEqual(['a', 'b'])
  })

  it('attributes a fragment with no index to the call already open', () => {
    // Some providers omit the index on continuation fragments.
    const accumulator = new ToolCallAccumulator()
    accumulator.add([{ index: 0, id: 'a', function: { name: 'read', arguments: '{"x"' } }])
    accumulator.add([{ function: { arguments: ':1}' } }])
    expect(accumulator.calls()[0]?.arguments).toBe('{"x":1}')
  })

  it('accepts an id that arrives after the name', () => {
    const accumulator = new ToolCallAccumulator()
    accumulator.add([{ index: 0, function: { name: 'read', arguments: '' } }])
    accumulator.add([{ index: 0, id: 'late', function: { arguments: '{}' } }])
    expect(accumulator.calls()[0]?.id).toBe('late')
  })

  it('invents a stable id when none is sent, so the result can be addressed', () => {
    const accumulator = new ToolCallAccumulator()
    accumulator.add([{ index: 0, function: { name: 'read', arguments: '{}' } }])
    expect(accumulator.calls()[0]?.id).toBe('call_0')
  })

  it('treats null arguments as no arguments rather than the text null', () => {
    const accumulator = new ToolCallAccumulator()
    accumulator.add([{ index: 0, id: 'a', function: { name: 'read', arguments: null } }])
    expect(accumulator.calls()[0]?.arguments).toBe('')
  })

  it('drops a call with no name, because it cannot be dispatched', () => {
    const accumulator = new ToolCallAccumulator()
    accumulator.add([{ index: 0, id: 'a', function: { arguments: '{}' } }])
    expect(accumulator.calls()).toEqual([])
    expect(accumulator.hasCalls()).toBe(false)
  })

  it('ignores junk without throwing', () => {
    const accumulator = new ToolCallAccumulator()
    accumulator.add(undefined)
    accumulator.add(null)
    accumulator.add('nonsense')
    accumulator.add(42)
    accumulator.add([null, 'x', 7])
    expect(accumulator.calls()).toEqual([])
  })

  it('reports nothing before any call is opened', () => {
    expect(new ToolCallAccumulator().hasCalls()).toBe(false)
  })
})

describe('parseToolArguments', () => {
  const call = (arguments_: string, name = 'read'): ToolCall => ({ id: 'a', name, arguments: arguments_ })

  it('parses a json object', () => {
    expect(parseToolArguments(call('{"path":"a.ts"}'))).toEqual({ ok: true, value: { path: 'a.ts' } })
  })

  it('treats empty arguments as an empty object, not an error', () => {
    expect(parseToolArguments(call(''))).toEqual({ ok: true, value: {} })
    expect(parseToolArguments(call('   '))).toEqual({ ok: true, value: {} })
  })

  it('reports invalid json so the model can correct it', () => {
    const result = parseToolArguments(call('{"path": '))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not valid JSON')
      expect(result.error).toContain('read')
    }
  })

  it('refuses a json array where an object is required', () => {
    const result = parseToolArguments(call('[1,2]'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('must be a JSON object')
  })

  it('refuses a bare primitive', () => {
    expect(parseToolArguments(call('"a.ts"')).ok).toBe(false)
    expect(parseToolArguments(call('null')).ok).toBe(false)
  })

  it('truncates a giant payload in the error message', () => {
    const result = parseToolArguments(call('{' + 'x'.repeat(2000)))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeLessThan(400)
  })
})

describe('runToolLoop', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'black-loop-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  /** A stream that replays a scripted round each time it is asked. */
  const scripted = (rounds: ChatStreamEvent[][], seen: ChatMessage[][] = []) => {
    let round = 0
    return async function* (messages: ChatMessage[]): AsyncGenerator<ChatStreamEvent> {
      seen.push(messages.map((message) => ({ ...message })))
      const events = rounds[Math.min(round, rounds.length - 1)] ?? []
      round++
      for (const event of events) {
        yield event
      }
    }
  }

  const collect = async (generator: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> => {
    const events: ChatStreamEvent[] = []
    for await (const event of generator) {
      events.push(event)
    }
    return events
  }

  const base = (stream: (messages: ChatMessage[]) => AsyncGenerator<ChatStreamEvent>) => ({
    messages: [{ role: 'user' as const, content: 'read a.ts' }],
    stream,
    cwd: dir
  })

  it('forwards a plain answer and finishes once', async () => {
    const events = await collect(
      runToolLoop(
        base(scripted([[{ type: 'text', text: 'hello' }, { type: 'done', stopReason: 'stop' }]]))
      )
    )
    expect(events.map((event) => event.type)).toEqual(['text', 'done'])
  })

  it('runs a tool, hands the result back, and lets the model answer', async () => {
    await writeFile(join(dir, 'a.ts'), 'const a = 1', 'utf-8')
    const seen: ChatMessage[][] = []
    const events = await collect(
      runToolLoop(
        base(
          scripted(
            [
              [
                { type: 'tool_calls', toolCalls: [{ id: 'c1', name: 'compute', arguments: "{\"title\": \"Read test file\", \"code\": \"async () => await workspace.read({\\\"path\\\":\\\"a.ts\\\"})\"}" }] },
                { type: 'done', stopReason: 'stop' }
              ],
              [{ type: 'text', text: 'It contains a constant.' }, { type: 'done', stopReason: 'stop' }]
            ],
            seen
          )
        )
      )
    )

    expect(events.map((event) => event.type)).toEqual(['tool_calls', 'tool_result', 'text', 'done'])

    // The tool actually read the file.
    const result = events.find((event) => event.type === 'tool_result')
    expect(result?.toolResult).toContain('const a = 1')
    expect(result?.toolIsError).toBe(false)

    // The second request carries the call and its result, or the model is
    // answering questions it has no record of asking.
    const second = seen[1] ?? []
    expect(second.map((message) => message.role)).toEqual(['user', 'assistant', 'tool'])
    expect(second[1]?.toolCalls?.[0]?.id).toBe('c1')
    expect(second[2]?.toolCallId).toBe('c1')
  })

  it('does not forward the intermediate done, because the turn is not over', async () => {
    await writeFile(join(dir, 'a.ts'), 'x', 'utf-8')
    const events = await collect(
      runToolLoop(
        base(
          scripted([
            [
              { type: 'tool_calls', toolCalls: [{ id: 'c1', name: 'compute', arguments: "{\"title\": \"Read test file\", \"code\": \"async () => await workspace.read({\\\"path\\\":\\\"a.ts\\\"})\"}" }] },
              { type: 'done', stopReason: 'stop' }
            ],
            [{ type: 'text', text: 'done now' }, { type: 'done', stopReason: 'stop' }]
          ])
        )
      )
    )
    expect(events.filter((event) => event.type === 'done').length).toBe(1)
  })

  it('reports an unknown tool as a result so the turn keeps going', async () => {
    // The API requires an answer for every call id it was given. Skipping this
    // makes the next request fail, and the model keeps waiting.
    const events = await collect(
      runToolLoop(
        base(
          scripted([
            [
              { type: 'tool_calls', toolCalls: [{ id: 'c1', name: 'bash', arguments: '{"command":"ls"}' }] },
              { type: 'done', stopReason: 'stop' }
            ],
            [{ type: 'text', text: 'ok' }, { type: 'done', stopReason: 'stop' }]
          ])
        )
      )
    )
    const result = events.find((event) => event.type === 'tool_result')
    expect(result?.toolIsError).toBe(true)
    expect(result?.toolResult).toContain('no tool named bash')
    expect(result?.toolResult).toContain('only available tool is compute')
    expect(events.some((event) => event.type === 'text')).toBe(true)
  })

  it('reports malformed arguments as a result rather than failing the turn', async () => {
    const events = await collect(
      runToolLoop(
        base(
          scripted([
            [
              { type: 'tool_calls', toolCalls: [{ id: 'c1', name: 'compute', arguments: '{oops' }] },
              { type: 'done', stopReason: 'stop' }
            ],
            [{ type: 'done', stopReason: 'stop' }]
          ])
        )
      )
    )
    const result = events.find((event) => event.type === 'tool_result')
    expect(result?.toolIsError).toBe(true)
    expect(result?.toolResult).toContain('not valid JSON')
  })

  it('turns a tool failure into a result instead of ending the turn', async () => {
    // A missing file is information, not a crash.
    const events = await collect(
      runToolLoop(
        base(
          scripted([
            [
              { type: 'tool_calls', toolCalls: [{ id: 'c1', name: 'compute', arguments: "{\"title\": \"Read test file\", \"code\": \"async () => await workspace.read({\\\"path\\\":\\\"missing.ts\\\"})\"}" }] },
              { type: 'done', stopReason: 'stop' }
            ],
            [{ type: 'text', text: 'That file is not there.' }, { type: 'done', stopReason: 'stop' }]
          ])
        )
      )
    )
    const result = events.find((event) => event.type === 'tool_result')
    expect(result?.toolIsError).toBe(true)
    expect(result?.toolResult).toContain('ENOENT')
    expect(events.some((event) => event.type === 'text')).toBe(true)
  })

  it('stops when the provider reports an error mid round', async () => {
    const events = await collect(runToolLoop(base(scripted([[{ type: 'error', message: 'upstream died' }]]))))
    expect(events.map((event) => event.type)).toEqual(['error'])
  })

  it('stops on an abort instead of running a tool that was already asked for', async () => {
    const controller = new AbortController()

    // The cancel lands after the model has asked for the tool but before it has
    // run. Running it anyway would write to disk on behalf of a turn the reader
    // already stopped.
    const stream = async function* (): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'text', text: 'partial' }
      controller.abort()
      yield { type: 'tool_calls', toolCalls: [{ id: 'c1', name: 'write', arguments: '{"path":"never.ts","content":"x"}' }] }
      yield { type: 'done', stopReason: 'stop' }
    }

    const events = await collect(runToolLoop({ ...base(stream), signal: controller.signal }))

    expect(events).toEqual([
      { type: 'text', text: 'partial', round: 0 },
      { type: 'done', stopReason: 'aborted' }
    ])
    // Nothing was written.
    expect(await Bun.file(join(dir, 'never.ts')).exists()).toBe(false)
  })

  it('does not start a round once the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let rounds = 0
    const stream = async function* (): AsyncGenerator<ChatStreamEvent> {
      rounds++
      yield { type: 'text', text: 'should not run' }
    }
    const events = await collect(runToolLoop({ ...base(stream), signal: controller.signal }))
    expect(rounds).toBe(0)
    expect(events).toEqual([{ type: 'done', stopReason: 'aborted' }])
  })

  it('reports an aborted round as aborted', async () => {
    const events = await collect(
      runToolLoop(base(scripted([[{ type: 'done', stopReason: 'aborted' }]])))
    )
    expect(events).toEqual([{ type: 'done', stopReason: 'aborted' }])
  })

  it('carries the usage from the final round', async () => {
    const events = await collect(
      runToolLoop(
        base(scripted([[{ type: 'text', text: 'hi' }, { type: 'done', stopReason: 'stop', usage: { input: 5, output: 7, total: 12 } }]]))
      )
    )
    expect(events.at(-1)?.usage).toEqual({ input: 5, output: 7, total: 12 })
  })

  it('gives up rather than looping forever when the model keeps asking', async () => {
    const forever = async function* (): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'tool_calls', toolCalls: [{ id: 'c', name: 'compute', arguments: "{\"title\": \"Read test file\", \"code\": \"async () => await workspace.read({\\\"path\\\":\\\"missing\\\"})\"}" }] }
      yield { type: 'done', stopReason: 'stop' }
    }
    const events = await collect(runToolLoop({ ...base(forever), maxRounds: 3 }))

    expect(events.filter((event) => event.type === 'tool_result').length).toBe(3)
    const error = events.find((event) => event.type === 'error')
    expect(error?.message).toContain('3 rounds')
    expect(events.at(-1)?.type).toBe('done')
  })

  it('passes through an event type it does not handle instead of dropping it', async () => {
    // The loop owns text, thinking, tool calls and done. Anything else is the
    // interface's business and must survive being forwarded.
    const events = await collect(
      runToolLoop(
        base(
          scripted([
            [
              { type: 'tool_result', toolCallId: 'foreign', toolName: 'x', toolResult: 'y' },
              { type: 'done', stopReason: 'stop' }
            ]
          ])
        )
      )
    )
    expect(events.map((event) => event.type)).toEqual(['tool_result', 'done'])
    expect(events[0]?.toolCallId).toBe('foreign')
  })
})
