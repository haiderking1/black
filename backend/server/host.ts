import { createServer, type Server } from 'node:http'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization'
import * as RpcServer from 'effect/unstable/rpc/RpcServer'
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer'

import { ServerRpcs } from '../../contracts/rpc'
import { buildHandlers } from './handlers'
import { mintToken, tokenMatches } from './token'

/** Path the RPC transport is mounted on. */
export const RPC_PATH = '/rpc'

/** Only the loopback interface is bound, so nothing on the network can reach it. */
export const BIND_HOST = '127.0.0.1'

/**
 * Where the server is listening, and the token that authorizes a connection.
 *
 * Host, port, and path are kept separate from the token so the renderer fetches
 * the token on demand rather than carrying it in a URL that could end up in a
 * log.
 */
export interface ServerEndpoint {
  host: string
  port: number
  path: string
  token: string
}

export interface ServerHandle {
  endpoint: ServerEndpoint
  /** Stops the server and releases the port. Safe to call more than once. */
  stop: () => Promise<void>
}

/**
 * The handler layer the group is served from. Injected so this module never
 * decides how handlers are built, which lets a test serve a stub without
 * loading Electron.
 */
export type ServerHandlers = ReturnType<typeof buildHandlers>

export interface StartServerOptions {
  port: number
  handlers: ServerHandlers
}

/** Bearer token, read from the query string because a renderer WebSocket sets no headers. */
function tokenFromRequestUrl(url: string | undefined): string | undefined {
  if (typeof url !== 'string') return undefined
  const queryStart = url.indexOf('?')
  if (queryStart === -1) return undefined
  return new URLSearchParams(url.slice(queryStart + 1)).get('token') ?? undefined
}

/**
 * Builds the HTTP server with an upgrade guard in front of the RPC route.
 *
 * A loopback port is reachable by every process on the machine, so binding to
 * 127.0.0.1 narrows the audience but does not authenticate it. This guard is
 * what does: an upgrade without the run's token is destroyed before the route
 * handler ever sees it.
 */
function createGuardedServer(token: string): Server {
  const server = createServer()
  server.on('upgrade', (request, socket) => {
    if (tokenMatches(token, tokenFromRequestUrl(request.url))) return
    socket.destroy()
  })
  return server
}

/**
 * Starts the RPC server and returns its endpoint.
 *
 * The route is mounted on the router and the router is served, which is what
 * makes the path reachable. The server owns every filesystem and dialog
 * operation; the renderer holds a client and no authority of its own.
 */
export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const token = mintToken()

  // The websocket protocol owns its own route and its own session lifetime.
  // Hand-rolling the route with HttpRouter.add flattened the per-request effect
  // into the request scope, so the socket was torn down as soon as the upgrade
  // response was written and no rpc message ever crossed.
  const protocol = RpcServer.layerProtocolWebsocket({ path: RPC_PATH }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
  )

  const rpc = RpcServer.layer(ServerRpcs).pipe(
    Layer.provide(options.handlers),
    Layer.provide(protocol),
  )

  // serve() supplies HttpRouter to the layers above it, which is what lets the
  // protocol register its route while still owning it.
  const application = HttpRouter.serve(rpc).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(
      NodeHttpServer.layer(() => createGuardedServer(token), { host: BIND_HOST, port: options.port }),
    ),
  )

  const fiber = Effect.runFork(Layer.launch(application))
  await waitForPort(options.port)

  let stopped = false
  return {
    endpoint: { host: BIND_HOST, port: options.port, path: RPC_PATH, token },
    stop: async () => {
      if (stopped) return
      stopped = true
      await Effect.runPromise(Fiber.interrupt(fiber))
    },
  }
}

/** Wait until something accepts a connection on the port, or give up. */
async function waitForPort(port: number): Promise<void> {
  const { connect } = await import('node:net')
  const deadline = Date.now() + 5000
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: BIND_HOST, port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
    })
    if (ok) return
    if (Date.now() > deadline) throw new Error('RPC server did not start listening on port ' + port)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
