import { describe, expect, it } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { METHODS } from '../contracts/methods'
import { ServerRpcs } from '../contracts/rpc'
import { startServer, type ServerHandle } from '../backend/server/host'
import { findFreePort } from '../backend/server/port'
import { connect } from '../frontend/rpc/client'

/**
 * Wire tests.
 *
 * Handlers are stubbed so the wire is exercised without loading Electron, which
 * is what injecting the handler layer buys.
 *
 * The round trip is included rather than skipped. An earlier version skipped it
 * with a plausible-sounding runtime excuse, and the transport was in fact broken:
 * the client built its connection inside a scope that closed before the first
 * request, so every call hung with nothing on the wire.
 */

function stubHandlers() {
  return ServerRpcs.toLayer({
    // A non-empty listing on purpose: an empty array decodes fine whatever the
    // entry schema is, which is how a class schema slipped through unnoticed.
    [METHODS.listDirectory]: () =>
      Effect.succeed({
        currentPath: '/stub',
        parentPath: '/',
        entries: [{ name: 'src', path: '/stub/src', isDirectory: true, isHidden: false }],
      }),
    [METHODS.openDirectoryDialog]: () => Effect.succeed(null),
    [METHODS.openInFiles]: () => Effect.succeed(''),
    [METHODS.getHomeDir]: () => Effect.succeed('/home/stub'),
    [METHODS.getCwd]: () => Effect.succeed('/stub-cwd'),
    [METHODS.listProviders]: () => Effect.succeed([]),
    [METHODS.setApiKey]: () =>
      Effect.succeed({
        id: 'opencode-go',
        name: 'OpenCode Go',
        baseUrl: 'https://example.test',
        enabled: true,
        authenticated: true,
        modelCount: 1,
      }),
    [METHODS.clearApiKey]: () =>
      Effect.succeed({
        id: 'opencode-go',
        name: 'OpenCode Go',
        baseUrl: 'https://example.test',
        enabled: true,
        authenticated: false,
        modelCount: null,
      }),
    [METHODS.listModels]: () => Effect.succeed([{ id: 'glm-5.3', ownedBy: 'opencode', created: 1 }]),
    [METHODS.stream]: () =>
      Stream.make({ type: 'text' as const, text: 'stub ' }, { type: 'done' as const, stopReason: 'stop' }),
    [METHODS.complete]: () =>
      Effect.succeed({
        text: 'stub reply',
        thinking: 'stub thinking',
        usage: { input: 1, output: 2, total: 3 },
        stopReason: 'stop',
      }),
    [METHODS.setEnabled]: () =>
      Effect.succeed({
        id: 'opencode-go',
        name: 'OpenCode Go',
        baseUrl: 'https://example.test',
        enabled: false,
        authenticated: false,
        modelCount: null,
      }),
  })
}

function urlFor(handle: ServerHandle, token: string): string {
  const { host, port, path } = handle.endpoint
  return 'ws://' + host + ':' + port + path + '?token=' + encodeURIComponent(token)
}

function httpUrlFor(handle: ServerHandle): string {
  const { host, port, path } = handle.endpoint
  return 'http://' + host + ':' + port + path
}

/** Open a raw socket and report how it ended, without waiting on the full protocol. */
function probeSocket(url: string): Promise<'open' | 'closed' | 'timeout'> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      try {
        socket.close()
      } catch {
        // already gone
      }
      resolve('timeout')
    }, 2000)
    socket.onopen = () => {
      clearTimeout(timer)
      socket.close()
      resolve('open')
    }
    socket.onerror = () => {
      clearTimeout(timer)
      resolve('closed')
    }
    socket.onclose = () => {
      clearTimeout(timer)
      resolve('closed')
    }
  })
}

describe('rpc wire', () => {
  it('answers a call over a real socket', async () => {
    const server = await startServer({ port: await findFreePort(), handlers: stubHandlers() })
    const connection = await connect({ url: urlFor(server, server.endpoint.token) })
    try {
      expect(await Effect.runPromise(connection.client[METHODS.getCwd]())).toBe('/stub-cwd')
      const providers = await Effect.runPromise(connection.client[METHODS.listProviders]())
      expect(providers).toEqual([])

      // The entries survive the round trip, not just the envelope around them.
      const listing = await Effect.runPromise(connection.client[METHODS.listDirectory]({}))
      expect(listing.entries).toEqual([
        { name: 'src', path: '/stub/src', isDirectory: true, isHidden: false },
      ])
    } finally {
      await connection.dispose()
      await server.stop()
    }
  })

  it('fails a call when the token is wrong instead of hanging', async () => {
    const server = await startServer({ port: await findFreePort(), handlers: stubHandlers() })
    const connection = await connect({ url: urlFor(server, 'not-the-token') })
    try {
      let failed = false
      try {
        await Effect.runPromise(connection.client[METHODS.getCwd]())
      } catch {
        failed = true
      }
      expect(failed).toBe(true)
    } finally {
      await connection.dispose()
      await server.stop()
    }
  })

  it('rejects a connection that does not carry the run token', async () => {
    const server = await startServer({ port: await findFreePort(), handlers: stubHandlers() })
    try {
      // The upgrade guard destroys the socket before the route handler runs.
      expect(await probeSocket(urlFor(server, 'not-the-token'))).toBe('closed')
    } finally {
      await server.stop()
    }
  })

  it('mounts the route, so a non-upgrade request reaches the handler', async () => {
    const server = await startServer({ port: await findFreePort(), handlers: stubHandlers() })
    try {
      // 400 with "not an upgradeable ServerRequest" means the path resolved and
      // the websocket handler rejected the plain request.
      const response = await fetch(httpUrlFor(server))
      expect(response.status).toBe(400)
    } finally {
      await server.stop()
    }
  })

  it('releases the port when stopped', async () => {
    const port = await findFreePort()
    const server = await startServer({ port, handlers: stubHandlers() })
    await server.stop()

    // A fresh server binds the same port, which proves the first one let go.
    const second = await startServer({ port, handlers: stubHandlers() })
    expect(second.endpoint.port).toBe(port)
    await second.stop()
  })

  it('tolerates stop being called twice', async () => {
    const server = await startServer({ port: await findFreePort(), handlers: stubHandlers() })
    await server.stop()
    await expect(server.stop()).resolves.toBeUndefined()
  })
})
