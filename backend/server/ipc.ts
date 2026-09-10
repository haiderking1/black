import { ipcMain } from 'electron'

import type { ServerEndpoint } from './host'

/**
 * The desktop handoff.
 *
 * The renderer cannot import the server, so it asks for the endpoint over IPC.
 * Both channels are synchronous, matching how a window bootstraps: the first
 * connection attempt happens while the app is still starting, and an async
 * round trip there only adds a race.
 */

export const GET_SERVER_ENDPOINT_CHANNEL = 'server:get-endpoint'
export const GET_SERVER_TOKEN_CHANNEL = 'server:get-token'

/** The endpoint without its token, safe to hand the renderer at any time. */
export interface PublicEndpoint {
  host: string
  port: number
  path: string
}

export function registerServerIpc(handleGetter: () => ServerEndpoint | null): void {
  ipcMain.on(GET_SERVER_ENDPOINT_CHANNEL, (event) => {
    const endpoint = handleGetter()
    event.returnValue =
      endpoint === null
        ? null
        : ({ host: endpoint.host, port: endpoint.port, path: endpoint.path } satisfies PublicEndpoint)
  })

  ipcMain.on(GET_SERVER_TOKEN_CHANNEL, (event) => {
    const endpoint = handleGetter()
    event.returnValue = endpoint === null ? null : endpoint.token
  })
}
