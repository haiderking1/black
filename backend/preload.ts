import { contextBridge, ipcRenderer } from 'electron'

import { GET_SERVER_ENDPOINT_CHANNEL, GET_SERVER_TOKEN_CHANNEL } from './server/ipc'

/**
 * The preload bridge.
 *
 * This is the only surface the renderer sees, and every entry is a deliberate
 * capability. The renderer cannot import the server, so it asks where the
 * server is; everything else travels over the RPC connection. Nothing here
 * exposes ipcRenderer itself.
 *
 * Both channels are synchronous, matching how a window bootstraps: the first
 * connection attempt happens while the app is still starting, and an async
 * round trip there only adds a race.
 */
contextBridge.exposeInMainWorld('blackDesktop', {
  getServerEndpoint: () => ipcRenderer.sendSync(GET_SERVER_ENDPOINT_CHANNEL),
  getServerToken: () => ipcRenderer.sendSync(GET_SERVER_TOKEN_CHANNEL)
})
