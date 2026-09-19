import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { oauthErrorHtml, oauthSuccessHtml } from '../../codex/oauth/page'
import { CALLBACK_HOST, CALLBACK_PATH, CALLBACK_PORTS, callbackUrlFor } from './constants'

export interface ClineCallbackPayload {
  code?: string
  provider?: string
  error?: string
}

export interface ClineCallbackWaiter {
  callbackUrl: string
  waitForCode(): Promise<ClineCallbackPayload | null>
  cancel(): void
  close(): void
}

export interface ClineCallbackServerOptions {
  host?: string
  ports?: readonly number[]
  path?: string
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
    server.closeAllConnections?.()
  } catch {
    // Already gone.
  }
  try {
    server.close()
  } catch {
    // Already gone.
  }
}

function pasteOnlyWaiter(
  callbackUrl: string,
  settleWait: ((value: ClineCallbackPayload | null) => void) | undefined,
): ClineCallbackWaiter {
  settleWait?.(null)
  return {
    callbackUrl,
    waitForCode: async () => null,
    cancel: () => {},
    close: () => {},
  }
}

/**
 * Local listener for the Cline OAuth redirect.
 *
 * Cline's extension flow tries ports 48801-48811 on `/auth`. The advertised
 * callback URL has to match the authorize request, so a bind failure still
 * keeps the first port in the URL for a pasted redirect.
 */
export async function startClineOAuthServer(
  options: ClineCallbackServerOptions = {},
): Promise<ClineCallbackWaiter> {
  const host = options.host ?? CALLBACK_HOST
  const ports = options.ports ?? CALLBACK_PORTS
  const path = options.path ?? CALLBACK_PATH
  const advertised = callbackUrlFor(ports[0] ?? CALLBACK_PORTS[0]!, host)

  let settleWait: ((value: ClineCallbackPayload | null) => void) | undefined
  const waitForCodePromise = new Promise<ClineCallbackPayload | null>((resolve) => {
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
      if (url.pathname !== path) {
        sendHtml(res, 404, oauthErrorHtml('Callback route not found.'))
        return
      }
      const error = url.searchParams.get('error')
      if (error !== null && error !== '') {
        sendHtml(res, 400, oauthErrorHtml('Authentication failed: ' + error))
        settleWait?.({ error })
        return
      }
      const code = url.searchParams.get('code')
      if (code === null || code === '') {
        sendHtml(res, 400, oauthErrorHtml('Missing authorization code.'))
        settleWait?.({ error: 'missing_code' })
        return
      }
      const provider = url.searchParams.get('provider')
      sendHtml(res, 200, oauthSuccessHtml('Cline sign-in completed. You can close this window.'))
      settleWait?.({
        code,
        ...(provider !== null && provider !== '' ? { provider } : {}),
      })
    } catch {
      sendHtml(res, 500, oauthErrorHtml('Internal error while processing OAuth callback.'))
      settleWait?.({ error: 'internal' })
    }
  }

  for (const port of ports) {
    const server = createServer(onRequest)
    try {
      await listen(server, port, host)
    } catch (error) {
      closeServer(server)
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined
      if (code === 'EADDRINUSE') continue
      throw error
    }

    return {
      callbackUrl: callbackUrlFor(port, host),
      waitForCode: () => waitForCodePromise,
      cancel: () => {
        settleWait?.(null)
      },
      close: () => {
        closeServer(server)
      },
    }
  }

  return pasteOnlyWaiter(advertised, settleWait)
}
