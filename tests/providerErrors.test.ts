import { describe, expect, it } from 'bun:test'

import { messageFromBody, readErrorBody } from '../backend/providers/errors'

describe('provider error bodies', () => {
  it('reads JSON validation errors with nested messages', async () => {
    const response = new Response(JSON.stringify({
      error: { details: [{ message: 'inner detail' }], message: 'Invalid request' },
    }), { status: 400, headers: { 'content-type': 'application/json' } })

    expect(messageFromBody(await readErrorBody(response), 'fallback')).toBe('Invalid request')
  })

  it('reads FastAPI-style detail arrays', async () => {
    const response = new Response(JSON.stringify({
      detail: [{ loc: ['body', 'model'], msg: 'unknown model', type: 'value_error' }],
    }), { status: 422, headers: { 'content-type': 'application/json' } })

    expect(messageFromBody(await readErrorBody(response), 'fallback')).toBe('unknown model')
  })

  it('decodes an error object wrapped in server-sent events', async () => {
    const response = new Response('event: error\ndata: {"error":{"message":"bad request"}}\n\n', {
      status: 400,
      headers: { 'content-type': 'text/event-stream' },
    })

    expect(messageFromBody(await readErrorBody(response), 'fallback')).toBe('bad request')
  })

  it('preserves bounded plain-text diagnostics and falls back only for empty bodies', async () => {
    const plain = new Response('unsupported option: reasoning_depth', { status: 400 })
    const oversized = new Response('x'.repeat(100_000), { status: 502 })
    const empty = new Response(null, { status: 502 })

    expect(messageFromBody(await readErrorBody(plain), 'HTTP 400')).toBe('unsupported option: reasoning_depth')
    expect(messageFromBody(await readErrorBody(oversized), 'HTTP 502')).toHaveLength(2000)
    expect(messageFromBody(await readErrorBody(empty), 'HTTP 502')).toBe('HTTP 502')
  })

  it('extracts details from arrays and nested cause objects', () => {
    expect(messageFromBody({ cause: { errors: [{ msg: 'first' }, { reason: 'second' }] } }, 'fallback'))
      .toBe('first; second')
  })
})
