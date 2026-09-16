import { afterEach, describe, expect, it } from 'bun:test'

import {
  CLIENT_ID,
  ORIGINATOR,
  REDIRECT_URI,
  TOKEN_URL,
  cancelBrowserLogin,
  createAuthorizationFlow,
  createState,
  generatePKCE,
  hasBrowserLogin,
  loginWithBrowser,
  parseAuthorizationInput,
  refreshOpenAICodexToken,
  accountIdFromAccessToken,
  startBrowserLogin,
  startLocalOAuthServer,
  submitBrowserLoginCode,
} from '../backend/providers/codex/oauth'
import { CALLBACK_PATH } from '../backend/providers/codex/oauth/constants'
import { oauthErrorHtml, oauthSuccessHtml } from '../backend/providers/codex/oauth/page'
import { findFreePort } from '../backend/server/port'

function accessToken(accountId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } }),
  ).toString('base64url')
  return header + '.' + payload + '.sig'
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function hangingCallback() {
  let settle: ((value: { code: string } | null) => void) | undefined
  const waitForCodePromise = new Promise<{ code: string } | null>((resolve) => {
    settle = resolve
  })
  return {
    waitForCode: () => waitForCodePromise,
    cancel: () => settle?.(null),
    close: () => {},
  }
}

afterEach(() => {
  cancelBrowserLogin()
})

describe('Codex OAuth PKCE and authorize URL', () => {
  it('builds a verifier and S256 challenge that are not equal', async () => {
    const first = await generatePKCE()
    const second = await generatePKCE()
    expect(first.verifier).not.toBe(first.challenge)
    expect(first.verifier).not.toBe(second.verifier)
    expect(first.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('puts the Codex client, PKCE, and simplified flow on the authorize URL', async () => {
    const flow = await createAuthorizationFlow()
    const url = new URL(flow.url)
    expect(url.origin + url.pathname).toBe('https://auth.openai.com/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('state')).toBe(flow.state)
    expect(url.searchParams.get('id_token_add_organizations')).toBe('true')
    expect(url.searchParams.get('codex_cli_simplified_flow')).toBe('true')
    expect(url.searchParams.get('originator')).toBe(ORIGINATOR)
    expect(url.searchParams.get('scope')).toContain('offline_access')
  })

  it('creates unique states', () => {
    expect(createState()).not.toBe(createState())
  })
})

describe('Codex OAuth parseAuthorizationInput', () => {
  it('reads code and state from a redirect URL', () => {
    expect(parseAuthorizationInput(REDIRECT_URI + '?code=abc&state=s1')).toEqual({ code: 'abc', state: 's1' })
  })

  it('reads a query string without a host', () => {
    expect(parseAuthorizationInput('code=abc&state=s1')).toEqual({ code: 'abc', state: 's1' })
  })

  it('reads code#state', () => {
    expect(parseAuthorizationInput('abc#s1')).toEqual({ code: 'abc', state: 's1' })
  })

  it('treats a bare string as the code', () => {
    expect(parseAuthorizationInput(' just-the-code ')).toEqual({ code: 'just-the-code' })
  })

  it('returns nothing for empty input', () => {
    expect(parseAuthorizationInput('   ')).toEqual({})
  })
})

describe('Codex JWT account id', () => {
  it('reads chatgpt_account_id from a base64url payload', () => {
    expect(accountIdFromAccessToken(accessToken('acct_1'))).toBe('acct_1')
  })

  it('reads chatgpt_account_id from a standard base64 payload', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64')
    const payload = Buffer.from(
      JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct_std' } }),
    ).toString('base64')
    expect(accountIdFromAccessToken(header + '.' + payload + '.sig')).toBe('acct_std')
  })

  it('rejects a token without an account id', () => {
    const header = Buffer.from('{}').toString('base64url')
    const payload = Buffer.from('{}').toString('base64url')
    expect(() => accountIdFromAccessToken(header + '.' + payload + '.sig')).toThrow(/accountId/)
  })
})

describe('Codex OAuth browser login', () => {
  const never = new AbortController().signal

  it('exchanges the callback code with PKCE against the token endpoint', async () => {
    const token = accessToken('acct-browser')
    let authorizeUrl = ''
    let resolveWait: ((value: { code: string } | null) => void) | undefined

    const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
      expect(input).toBe(TOKEN_URL)
      expect(init?.method).toBe('POST')
      const params = new URLSearchParams(String(init?.body))
      expect(params.get('grant_type')).toBe('authorization_code')
      expect(params.get('client_id')).toBe(CLIENT_ID)
      expect(params.get('code')).toBe('oauth-code')
      expect(params.get('redirect_uri')).toBe(REDIRECT_URI)
      expect(params.get('code_verifier')).toBeTruthy()
      return jsonResponse({ access_token: token, refresh_token: 'refresh-1', expires_in: 3600 })
    }

    const credential = await loginWithBrowser({
      openUrl: async (url) => {
        authorizeUrl = url
      },
      signal: never,
      fetchImpl,
      createCallback: async () => ({
        waitForCode: () =>
          new Promise((resolve) => {
            resolveWait = resolve
            resolveWait({ code: 'oauth-code' })
          }),
        cancel: () => resolveWait?.(null),
        close: () => {},
      }),
    })

    expect(authorizeUrl).toContain('client_id=' + CLIENT_ID)
    expect(credential).toMatchObject({
      type: 'oauth',
      access: token,
      refresh: 'refresh-1',
      accountId: 'acct-browser',
    })
    expect(credential.expires).toBeGreaterThan(Date.now())
  })

  it('accepts a pasted redirect URL when the callback never fires', async () => {
    const token = accessToken('acct-paste')
    let state = ''

    const credential = await loginWithBrowser({
      openUrl: async (url) => {
        state = new URL(url).searchParams.get('state') ?? ''
      },
      signal: never,
      fetchImpl: async () =>
        jsonResponse({ access_token: token, refresh_token: 'refresh-2', expires_in: 60 }),
      createCallback: async () => ({
        waitForCode: async () => null,
        cancel: () => {},
        close: () => {},
      }),
      waitForManualCode: async () => REDIRECT_URI + '?code=pasted-code&state=' + state,
    })

    expect(credential.accountId).toBe('acct-paste')
  })

  it('rejects a pasted URL whose state does not match', async () => {
    await expect(
      loginWithBrowser({
        openUrl: async () => {},
        signal: never,
        createCallback: async () => ({
          waitForCode: async () => null,
          cancel: () => {},
          close: () => {},
        }),
        waitForManualCode: async () => REDIRECT_URI + '?code=x&state=wrong',
      }),
    ).rejects.toThrow(/State mismatch/)
  })

  it('cancels when the abort signal fires while waiting', async () => {
    const controller = new AbortController()
    const pending = loginWithBrowser({
      openUrl: async () => {},
      signal: controller.signal,
      createCallback: async () => hangingCallback(),
    })
    controller.abort()
    await expect(pending).rejects.toThrow('Login cancelled')
  })
})

describe('Codex OAuth refresh', () => {
  it('exchanges a refresh token and reads the new account id', async () => {
    const token = accessToken('acct-refresh')
    const next = await refreshOpenAICodexToken('old-refresh', new AbortController().signal, async (input, init) => {
      expect(input).toBe(TOKEN_URL)
      const params = new URLSearchParams(String(init?.body))
      expect(params.get('grant_type')).toBe('refresh_token')
      expect(params.get('refresh_token')).toBe('old-refresh')
      expect(params.get('client_id')).toBe(CLIENT_ID)
      return jsonResponse({ access_token: token, refresh_token: 'new-refresh', expires_in: 120 })
    })
    expect(next).toMatchObject({ access: token, refresh: 'new-refresh', accountId: 'acct-refresh' })
  })

  it('surfaces a missing field from the token endpoint', async () => {
    await expect(
      refreshOpenAICodexToken('old', new AbortController().signal, async () =>
        jsonResponse({ access_token: 'only' }),
      ),
    ).rejects.toThrow(/missing fields/)
  })
})

describe('Codex OAuth callback pages', () => {
  it('escapes HTML in the error page', () => {
    const html = oauthErrorHtml('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert')
    expect(oauthSuccessHtml('done')).toContain('Authentication successful')
  })
})

describe('Codex OAuth login session', () => {
  it('delivers a pasted code to the in-flight browser login', async () => {
    const token = accessToken('acct-session')
    const pending = startBrowserLogin({
      openUrl: async () => {},
      fetchImpl: async () => jsonResponse({ access_token: token, refresh_token: 'r', expires_in: 60 }),
      createCallback: async () => hangingCallback(),
    })
    expect(hasBrowserLogin()).toBe(true)
    submitBrowserLoginCode('pasted-code')
    await expect(pending).resolves.toMatchObject({ accountId: 'acct-session', refresh: 'r' })
    expect(hasBrowserLogin()).toBe(false)
  })

  it('cancels an in-flight login', async () => {
    const pending = startBrowserLogin({
      openUrl: async () => {},
      createCallback: async () => hangingCallback(),
    })
    expect(hasBrowserLogin()).toBe(true)
    cancelBrowserLogin()
    expect(hasBrowserLogin()).toBe(false)
    await expect(pending).rejects.toThrow('Login cancelled')
  })

  it('rejects an empty pasted code', () => {
    startBrowserLogin({
      openUrl: async () => {},
      createCallback: async () => hangingCallback(),
    }).catch(() => {})
    expect(() => submitBrowserLoginCode('   ')).toThrow(/authorization code/)
  })

  it('cancels the previous attempt when a new sign-in starts', async () => {
    const first = startBrowserLogin({
      openUrl: async () => {},
      createCallback: async () => hangingCallback(),
    })
    const token = accessToken('acct-second')
    const second = startBrowserLogin({
      openUrl: async () => {},
      fetchImpl: async () => jsonResponse({ access_token: token, refresh_token: 'r2', expires_in: 60 }),
      createCallback: async () => hangingCallback(),
    })
    await expect(first).rejects.toThrow('Login cancelled')
    submitBrowserLoginCode('second-code')
    await expect(second).resolves.toMatchObject({ accountId: 'acct-second' })
  })
})

describe('Codex OAuth loopback callback', () => {
  it('exchanges a real loopback bounce for tokens', async () => {
    const token = accessToken('acct-loopback')
    const port = await findFreePort()
    const credential = await loginWithBrowser({
      openUrl: async (url) => {
        const state = new URL(url).searchParams.get('state')
        const response = await fetch(
          'http://127.0.0.1:' + String(port) + CALLBACK_PATH + '?code=loopback-code&state=' + state,
        )
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('ChatGPT sign-in completed')
      },
      signal: new AbortController().signal,
      fetchImpl: async (_input, init) => {
        const params = new URLSearchParams(String(init?.body))
        expect(params.get('code')).toBe('loopback-code')
        expect(params.get('code_verifier')).toBeTruthy()
        return jsonResponse({ access_token: token, refresh_token: 'loop-refresh', expires_in: 90 })
      },
      createCallback: (state) => startLocalOAuthServer(state, { port }),
    })
    expect(credential).toMatchObject({ accountId: 'acct-loopback', refresh: 'loop-refresh' })
  })

  it('rejects a bounce whose state does not match', async () => {
    const port = await findFreePort()
    const waiter = await startLocalOAuthServer('expected-state', { port })
    try {
      const mismatch = await fetch(
        'http://127.0.0.1:' + String(port) + CALLBACK_PATH + '?code=x&state=wrong',
      )
      expect(mismatch.status).toBe(400)
      expect(await mismatch.text()).toContain('State mismatch')
      const missing = await fetch('http://127.0.0.1:' + String(port) + '/nope')
      expect(missing.status).toBe(404)
    } finally {
      waiter.cancel()
      waiter.close()
    }
  })

  it('falls back to paste when the callback port is already taken', async () => {
    const port = await findFreePort()
    const occupant = await startLocalOAuthServer('first', { port })
    try {
      const fallback = await startLocalOAuthServer('second', { port })
      expect(await fallback.waitForCode()).toBeNull()
      fallback.close()
    } finally {
      occupant.cancel()
      occupant.close()
    }
  })
})
