import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Exit from 'effect/Exit'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Scope from 'effect/Scope'
import * as RpcClient from 'effect/unstable/rpc/RpcClient'
import type * as RpcClientError from 'effect/unstable/rpc/RpcClientError'
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization'
import * as Socket from 'effect/unstable/socket/Socket'

import { ServerRpcs } from '../../contracts/rpc'

/**
 * The renderer side of the wire.
 *
 * The renderer holds no authority: every filesystem, session, and settings
 * operation goes through a typed call. A method returns the success value its
 * contract declared, or fails with one of the error tags declared alongside it.
 *
 * Transport failures are separate from those declared errors and arrive as
 * RpcClientError, so a caller can tell "the server said no" apart from "the
 * socket is gone".
 */

export type ServerClientError = RpcClientError.RpcClientError
export type ServerClient = RpcClient.FromGroup<typeof ServerRpcs, ServerClientError>

export interface ConnectOptions {
  /** WebSocket URL including the bearer token. */
  url: string
}

export interface Connection {
  client: ServerClient
  /** Closes the socket and releases the runtime. Safe to call more than once. */
  dispose: () => Promise<void>
}

/**
 * Connects to a running server.
 *
 * The connection lives inside a ManagedRuntime rather than a scope created per
 * call. Building the client and then leaving the scope tears the protocol down
 * before the first request, which shows up as every call hanging forever with
 * nothing on the wire. The runtime keeps the protocol, the socket, and the
 * scope it needs alive until dispose().
 */
export async function connect(options: ConnectOptions): Promise<Connection> {
  const socket = Socket.layerWebSocket(options.url).pipe(
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
  )

  const protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
    Layer.provide(socket),
    Layer.provide(RpcSerialization.layerNdjson),
  )

  // The runtime keeps the protocol and the socket alive; this scope is what
  // satisfies the client's own scope requirement and is held open for the life
  // of the connection rather than closed when construction returns.
  const runtime = ManagedRuntime.make(protocol)
  const scope = Effect.runSync(Scope.make())
  const client = await runtime.runPromise(
    RpcClient.make(ServerRpcs).pipe(Effect.provideService(Scope.Scope, scope)),
  )

  let disposed = false
  return {
    client,
    dispose: async () => {
      if (disposed) return
      disposed = true
      await Effect.runPromise(Scope.close(scope, Exit.void))
      await runtime.dispose()
    },
  }
}
