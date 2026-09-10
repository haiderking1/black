import { afterEach, describe, expect, it } from 'bun:test'

import {
  abortRequest,
  beginRequest,
  endRequest,
  openRequestCount,
} from '../backend/chat/inflight'

afterEach(() => {
  // The registry is module state, so a leaked entry would cross into the next test.
  for (const id of ['a', 'b', 'c']) abortRequest(id)
})

describe('beginRequest', () => {
  it('hands back a signal that is not aborted yet', () => {
    const controller = beginRequest('a')
    expect(controller.signal.aborted).toBe(false)
    expect(openRequestCount()).toBe(1)
  })

  it('aborts an earlier request reusing the same id, rather than stranding it', () => {
    const first = beginRequest('a')
    const second = beginRequest('a')

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    // The stranded one must not still be counted.
    expect(openRequestCount()).toBe(1)
  })
})

describe('abortRequest', () => {
  it('aborts the signal the caller is holding', () => {
    const controller = beginRequest('a')
    expect(abortRequest('a')).toBe(true)
    expect(controller.signal.aborted).toBe(true)
  })

  it('reports false for an unknown id', () => {
    expect(abortRequest('never-opened')).toBe(false)
  })

  it('reports false the second time, so a double click is not an error', () => {
    beginRequest('a')
    expect(abortRequest('a')).toBe(true)
    expect(abortRequest('a')).toBe(false)
  })
})

describe('endRequest', () => {
  it('clears a finished request', () => {
    const controller = beginRequest('a')
    endRequest('a', controller)
    expect(openRequestCount()).toBe(0)
  })

  it('does not clear a newer request that took over the id', () => {
    // The first request finishing after its id was reused must not remove the
    // controller that replaced it, which would make the new one uncancellable.
    const first = beginRequest('a')
    const second = beginRequest('a')

    endRequest('a', first)

    expect(openRequestCount()).toBe(1)
    expect(abortRequest('a')).toBe(true)
    expect(second.signal.aborted).toBe(true)
  })

  it('is harmless for an id that was already aborted', () => {
    const controller = beginRequest('a')
    abortRequest('a')
    endRequest('a', controller)
    expect(openRequestCount()).toBe(0)
  })
})
