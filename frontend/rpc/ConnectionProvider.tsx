import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { connectToDesktop } from './bootstrap'
import type { Connection, ServerClient } from './client'

/**
 * The connection owner.
 *
 * One connection serves the whole app. A component asks for the client and
 * calls methods on it; nothing opens a socket of its own, so the retry policy
 * and the socket lifetime stay in one place.
 *
 * While the connection is still being established the client is null. Callers
 * treat that as "not ready yet" rather than as a failure.
 */

interface ConnectionState {
  client: ServerClient | null
  error: string | null
}

const ConnectionContext = createContext<ConnectionState>({ client: null, error: null })

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return String(error)
}

export function ConnectionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<ConnectionState>({ client: null, error: null })

  useEffect(() => {
    let cancelled = false
    let connection: Connection | null = null

    connectToDesktop()
      .then((established) => {
        // StrictMode runs effects twice in development. The abandoned attempt is
        // disposed rather than left open.
        if (cancelled) {
          void established.dispose()
          return
        }
        connection = established
        setState({ client: established.client, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ client: null, error: messageOf(error) })
      })

    return () => {
      cancelled = true
      if (connection !== null) void connection.dispose()
    }
  }, [])

  return <ConnectionContext.Provider value={state}>{children}</ConnectionContext.Provider>
}

/** The shared client, or null while the connection is still being established. */
export function useRpcClient(): ServerClient | null {
  return useContext(ConnectionContext).client
}

/** Why the connection could not be established, or null. */
export function useRpcError(): string | null {
  return useContext(ConnectionContext).error
}

export { messageOf as describeRpcError }
