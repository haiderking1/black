import { describe, expect, it } from 'bun:test'

import { newRequestId } from '../frontend/chat/requestId'

describe('newRequestId', () => {
  it('produces something', () => {
    expect(newRequestId().length).toBeGreaterThan(0)
  })

  it('does not repeat across a run of calls', () => {
    // Two turns sharing an id would make cancelling one abort the other.
    const ids = new Set<string>()
    for (let i = 0; i < 500; i += 1) ids.add(newRequestId())
    expect(ids.size).toBe(500)
  })
})
