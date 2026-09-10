import { connect, type Connection } from './client'

/**
 * Renderer bootstrap.
 *
 * The renderer asks the desktop for its endpoint and token, then connects. Both
 * come from the preload bridge; nothing here guesses a port or holds a secret.
 */

interface DesktopBridge {
  getServerEndpoint: () => { host: string; port: number; path: string } | null
  getServerToken: () => string | null
}

function bridge(): DesktopBridge | null {
  const candidate = (globalThis as { blackDesktop?: unknown }).blackDesktop
  if (typeof candidate !== 'object' || candidate === null) return null
  return candidate as DesktopBridge
}

/** Compose the WebSocket URL. The token rides in the query string. */
export function endpointUrl(endpoint: { host: string; port: number; path: string }, token: string): string {
  return 'ws://' + endpoint.host + ':' + endpoint.port + endpoint.path + '?token=' + encodeURIComponent(token)
}

/** Connect using the endpoint the desktop hands over. */
export async function connectToDesktop(): Promise<Connection> {
  const desktop = bridge()
  if (desktop === null) {
    throw new Error('Desktop bridge is unavailable; not running inside the app shell')
  }

  const endpoint = desktop.getServerEndpoint()
  if (endpoint === null) {
    throw new Error('The desktop has not started its server yet')
  }

  const token = desktop.getServerToken()
  if (typeof token !== 'string' || token === '') {
    throw new Error('The desktop did not provide a server token')
  }

  return connect({ url: endpointUrl(endpoint, token) })
}
