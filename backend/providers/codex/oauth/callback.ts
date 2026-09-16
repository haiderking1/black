import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { CALLBACK_HOST, CALLBACK_PATH, CALLBACK_PORT } from './constants'
import { oauthErrorHtml, oauthSuccessHtml } from './page'
import type { CallbackWaiter } from './types'

export interface CallbackServerOptions {
  host?: string
  port?: number
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

function closeServer(server: Server): void {
  try {
    server.close()
  } catch {
    // Already gone.
  }
}

function pasteOnlyWaiter(settleWait: ((value: { code: string } | null) => void) | undefined): CallbackWaiter {
  settleWait?.(null)
  return {
    waitForCode: async () => null,
    cancel: () => {},
    close: () => {},
  }
}

/**
 * Local listener for the Codex OAuth redirect.
 *
 * The registered redirect is `http://localhost:1455/auth/callback`. Browsers
 * resolve localhost to 127.0.0.1, ::1, or both, so the waiter binds IPv4 and
 * then IPv6 on that port. If 127.0.0.1 is already taken the waiter resolves
 * empty so the reader can paste the URL.
 */
export async function startLocalOAuthServer(
  state: string,
  options: CallbackServerOptions = {},
): Promise<CallbackWaiter> {
  const host = options.host ?? CALLBACK_HOST
  const port = options.port ?? CALLBACK_PORT

  let settleWait: ((value: { code: string } | null) => void) | undefined
  const waitForCodePromise = new Promise<{ code: string } | null>((resolve) => {
    let settled = false
    settleWait = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
  })

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    try {
      const url = new URL(req.url ?? '', 'http://localhost')
      if (url.pathname !== CALLBACK_PATH) {
        sendHtml(res, 404, oauthErrorHtml('Callback route not found.'))
        return
      }
      if (url.searchParams.get('state') !== state) {
        sendHtml(res, 400, oauthErrorHtml('State mismatch.'))
        return
      }
      const code = url.searchParams.get('code')
      if (code === null || code === '') {
        sendHtml(res, 400, oauthErrorHtml('Missing authorization code.'))
        return
      }
      sendHtml(res, 200, oauthSuccessHtml('ChatGPT sign-in completed. You can close this window.'))
      settleWait?.({ code })
    } catch {
      sendHtml(res, 500, oauthErrorHtml('Internal error while processing OAuth callback.'))
    }
  }

  const servers: Server[] = []
  const primary = createServer(onRequest)
  try {
    await listen(primary, port, host)
    servers.push(primary)
  } catch {
    closeServer(primary)
    return pasteOnlyWaiter(settleWait)
  }

  if (host === CALLBACK_HOST) {
    const ipv6 = createServer(onRequest)
    try {
      await listen(ipv6, port, '::1')
      servers.push(ipv6)
    } catch {
      closeServer(ipv6)
    }
  }

  return {
    waitForCode: () => waitForCodePromise,
    cancel: () => {
      settleWait?.(null)
    },
    close: () => {
      for (const server of servers) closeServer(server)
    },
  }
}
