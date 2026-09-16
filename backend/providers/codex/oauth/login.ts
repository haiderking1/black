import { startLocalOAuthServer } from './callback'
import { REDIRECT_URI } from './constants'
import { createAuthorizationFlow } from './authorize'
import { parseAuthorizationInput } from './parse'
import { exchangeAuthorizationCodeForCredentials, type FetchLike } from './tokens'
import type { CallbackWaiter, CreateCallback, OAuthCredential } from './types'

export interface BrowserLoginOptions {
  openUrl: (url: string) => Promise<void>
  signal: AbortSignal
  fetchImpl?: FetchLike
  createCallback?: CreateCallback
  onAuthUrl?: (url: string) => void
  /** Resolves with a pasted code or redirect URL. Races the local callback. */
  waitForManualCode?: () => Promise<string>
}

/**
 * ChatGPT Codex browser login.
 *
 * Starts a loopback callback, opens the authorize URL, and races that bounce
 * against a pasted code. Whichever arrives first wins. The callback server is
 * always closed, including on cancel.
 */
export async function loginWithBrowser(options: BrowserLoginOptions): Promise<OAuthCredential> {
  const doFetch = options.fetchImpl ?? fetch
  const { verifier, state, url } = await createAuthorizationFlow()
  const createCallback = options.createCallback ?? ((expectedState) => startLocalOAuthServer(expectedState))
  const server: CallbackWaiter = await createCallback(state)
  const onAbort = () => server.cancel()
  options.signal.addEventListener('abort', onAbort, { once: true })
  if (options.signal.aborted) onAbort()

  options.onAuthUrl?.(url)
  try {
    await options.openUrl(url)
  } catch (error) {
    if (options.waitForManualCode === undefined) {
      server.close()
      options.signal.removeEventListener('abort', onAbort)
      throw error
    }
  }

  let code: string | undefined
  let manualCode: string | undefined
  let manualError: Error | undefined
  const manualAbort = new AbortController()

  try {
    const manualPromise =
      options.waitForManualCode === undefined
        ? Promise.resolve()
        : options
            .waitForManualCode()
            .then((input) => {
              manualCode = input
              server.cancel()
            })
            .catch((error: unknown) => {
              manualError = error instanceof Error ? error : new Error(String(error))
              server.cancel()
            })

    const result = await server.waitForCode()
    if (manualError !== undefined) throw manualError
    if (result?.code !== undefined && result.code !== '') {
      code = result.code
    } else if (manualCode !== undefined) {
      const parsed = parseAuthorizationInput(manualCode)
      if (parsed.state !== undefined && parsed.state !== state) throw new Error('State mismatch')
      code = parsed.code
    }

    if (code === undefined || code === '') {
      await manualPromise
      if (manualError !== undefined) throw manualError
      if (manualCode !== undefined) {
        const parsed = parseAuthorizationInput(manualCode)
        if (parsed.state !== undefined && parsed.state !== state) throw new Error('State mismatch')
        code = parsed.code
      }
    }

    if (code === undefined || code === '') {
      if (options.signal.aborted) throw new Error('Login cancelled')
      throw new Error('Missing authorization code')
    }

    return await exchangeAuthorizationCodeForCredentials(code, verifier, REDIRECT_URI, options.signal, doFetch)
  } finally {
    options.signal.removeEventListener('abort', onAbort)
    manualAbort.abort()
    server.close()
  }
}
