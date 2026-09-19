import type { OAuthCredential } from '../../codex/oauth/types'
import { createAuthorizationUrl } from './authorize'
import { startClineOAuthServer, type ClineCallbackWaiter } from './callback'
import { parseAuthorizationInput } from './parse'
import { exchangeAuthorizationCodeForCredentials, type FetchLike } from './tokens'

export interface ClineBrowserLoginOptions {
  openUrl: (url: string) => Promise<void>
  signal: AbortSignal
  fetchImpl?: FetchLike
  createCallback?: () => Promise<ClineCallbackWaiter>
  onAuthUrl?: (url: string) => void
  /** Resolves with a pasted code or redirect URL. Races the local callback. */
  waitForManualCode?: () => Promise<string>
}

/**
 * Cline browser login.
 *
 * Starts a loopback callback on Cline's extension ports, opens authorize, and
 * races that bounce against a pasted code. Whichever arrives first wins.
 */
export async function loginWithClineBrowser(options: ClineBrowserLoginOptions): Promise<OAuthCredential> {
  const doFetch = options.fetchImpl ?? fetch
  const createCallback = options.createCallback ?? (() => startClineOAuthServer())
  const server = await createCallback()
  const onAbort = () => server.cancel()
  options.signal.addEventListener('abort', onAbort, { once: true })
  if (options.signal.aborted) onAbort()

  const url = createAuthorizationUrl(server.callbackUrl)
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
  let provider: string | undefined
  let manualCode: string | undefined
  let manualError: Error | undefined

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
    if (result?.error !== undefined && result.error !== '') {
      throw new Error('OAuth error: ' + result.error)
    }
    if (result?.code !== undefined && result.code !== '') {
      code = result.code
      provider = result.provider
    } else if (manualCode !== undefined) {
      const parsed = parseAuthorizationInput(manualCode)
      code = parsed.code
      provider = parsed.provider
    }

    if (code === undefined || code === '') {
      await manualPromise
      if (manualError !== undefined) throw manualError
      if (manualCode !== undefined) {
        const parsed = parseAuthorizationInput(manualCode)
        code = parsed.code
        provider = parsed.provider
      }
    }

    if (code === undefined || code === '') {
      if (options.signal.aborted) throw new Error('Login cancelled')
      throw new Error('Missing authorization code')
    }

    return await exchangeAuthorizationCodeForCredentials(
      code,
      server.callbackUrl,
      options.signal,
      doFetch,
      provider,
    )
  } finally {
    options.signal.removeEventListener('abort', onAbort)
    server.close()
  }
}
