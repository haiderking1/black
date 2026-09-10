/// <reference types="vite/client" />

/**
 * The endpoint the desktop hands the renderer at startup.
 *
 * The renderer cannot import the server, so it asks the preload bridge where the
 * server is listening. This is the only thing the bridge exposes.
 */
export interface DesktopServerEndpoint {
  host: string
  port: number
  path: string
}

declare global {
  interface Window {
    blackDesktop?: {
      getServerEndpoint: () => DesktopServerEndpoint | null
      getServerToken: () => string | null
    }
  }
}
