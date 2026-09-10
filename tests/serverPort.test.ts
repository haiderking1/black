import { describe, expect, it } from 'bun:test'
import { createServer } from 'node:net'

import { findFreePort } from '../backend/server/port'

describe('findFreePort', () => {
  it('returns a port that can actually be bound', async () => {
    const port = await findFreePort()
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThanOrEqual(65535)

    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve())
    })
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('does not hand out the same port twice in a row', async () => {
    const first = await findFreePort()
    const second = await findFreePort()
    expect(first).not.toBe(second)
  })
})
