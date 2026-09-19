import { afterEach, describe, expect, it } from 'bun:test'

import {
  AUTHORIZE_URL,
  CALLBACK_PATH,
  CLIENT_TYPE,
  PROVIDER_ID,
  REFRESH_URL,
  TOKEN_URL,
  createAuthorizationUrl,
  exchangeAuthorizationCodeForCredentials,
  loginWithClineBrowser,
  parseAuthorizationInput,
  refreshClineToken,
  startClineOAuthServer,
} from '../backend/providers/cline/oauth'
import {
  cancelBrowserLogin,
  hasBrowserLogin,
  startBrowserLogin,
  submitBrowserLoginCode,
} from '../backend/providers/oauth/session'
import { findFreePort } from '../backend/server/port'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function tokenPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      userInfo: {
        subject: 'sub-1',
        email: 'user@cline.test',
        name: 'User',
        clineUserId: 'cline-user-1',
        accounts: null,
      },
      ...overrides,
    },
  }
}

function hangingCallback(callbackUrl = 'http://127.0.0.1:48801/auth') {
  let settle: ((value: { code: string; provider?: string } | null) => void) | undefined
  const waitForCodePromise = new Promise<{ code: string; provider?: string } | null>((resolve) => {
    settle = resolve
  })
  return {
    callbackUrl,
    waitForCode: () => waitForCodePromise,
    cancel: () => settle?.(null),
    close: () => {},
  }
}

afterEach(() => {
  cancelBrowserLogin(PROVIDER_ID)
  cancelBrowserLogin('openai-codex')
})

describe('Cline OAuth authorize URL', () => {
  it('uses the extension client and the loopback callback', () => {
    const url = new URL(createAuthorizationUrl('http://127.0.0.1:48801/auth'))
    expect(url.origin + url.pathname).toBe(AUTHORIZE_URL)
    expect(url.searchParams.get('client_type')).toBe(CLIENT_TYPE)
    expect(url.searchParams.get('callback_url')).toBe('http://127.0.0.1:48801/auth')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:48801/auth')
    expect(url.searchParams.get('client_id')).toBeNull()
    expect(url.searchParams.get('code_challenge')).toBeNull()
  })
})

describe('Cline OAuth parseAuthorizationInput', () => {
  it('reads code and provider from a redirect URL', () => {
    expect(parseAuthorizationInput('http://127.0.0.1:48801/auth?code=abc&provider=google')).toEqual({
      code: 'abc',
      provider: 'google',
    })
  })

  it('reads a query string without a host', () => {
    expect(parseAuthorizationInput('code=abc&provider=github')).toEqual({
      code: 'abc',
      provider: 'github',
    })
  })

  it('treats a bare string as the code', () => {
    expect(parseAuthorizationInput(' just-the-code ')).toEqual({ code: 'just-the-code' })
  })

  it('returns nothing for empty input', () => {
    expect(parseAuthorizationInput('   ')).toEqual({})
  })
})

describe('Cline OAuth token exchange', () => {
  it('posts JSON with the extension client and reads clineUserId', async () => {
    const next = await exchangeAuthorizationCodeForCredentials(
      'auth-code',
      'http://127.0.0.1:48801/auth',
      new AbortController().signal,
      async (input, init) => {
        expect(input).toBe(TOKEN_URL)
        expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body).toEqual({
          grant_type: 'authorization_code',
          code: 'auth-code',
          client_type: CLIENT_TYPE,
          redirect_uri: 'http://127.0.0.1:48801/auth',
          provider: 'google',
        })
        return jsonResponse(tokenPayload())
      },
      'google',
    )
    expect(next).toMatchObject({
      type: 'oauth',
      access: 'access-1',
      refresh: 'refresh-1',
      accountId: 'cline-user-1',
    })
    expect(next.expires).toBeGreaterThan(Date.now())
  })

  it('falls back to email when clineUserId is missing', async () => {
    const next = await exchangeAuthorizationCodeForCredentials(
      'auth-code',
      'http://127.0.0.1:48801/auth',
      new AbortController().signal,
      async () =>
        jsonResponse(
          tokenPayload({
            userInfo: { subject: 'sub', email: 'only@cline.test', name: 'Only', clineUserId: null, accounts: null },
          }),
        ),
    )
    expect(next.accountId).toBe('only@cline.test')
  })

  it('refuses an exchange with no account identity', async () => {
    await expect(
      exchangeAuthorizationCodeForCredentials(
        'auth-code',
        'http://127.0.0.1:48801/auth',
        new AbortController().signal,
        async () =>
          jsonResponse(
            tokenPayload({
              userInfo: { subject: null, email: '', name: '', clineUserId: null, accounts: null },
            }),
          ),
      ),
    ).rejects.toThrow(/accountId/)
  })

  it('surfaces a missing access token', async () => {
    await expect(
      exchangeAuthorizationCodeForCredentials(
        'code',
        'http://127.0.0.1:48801/auth',
        new AbortController().signal,
        async () => jsonResponse({ success: true, data: { refreshToken: 'r' } }),
      ),
    ).rejects.toThrow(/missing fields/)
  })
})

describe('Cline OAuth refresh', () => {
  it('posts the refresh token as JSON and keeps the stored account', async () => {
    const next = await refreshClineToken(
      {
        type: 'oauth',
        access: 'old',
        refresh: 'old-refresh',
        expires: Date.now() - 1000,
        accountId: 'kept-user',
      },
      new AbortController().signal,
      async (input, init) => {
        expect(input).toBe(REFRESH_URL)
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body).toEqual({ refreshToken: 'old-refresh', grantType: 'refresh_token' })
        return jsonResponse(
          tokenPayload({
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
            userInfo: { subject: null, email: '', name: '', clineUserId: null, accounts: null },
          }),
        )
      },
    )
    expect(next).toMatchObject({ access: 'new-access', refresh: 'new-refresh', accountId: 'kept-user' })
  })
})

describe('Cline OAuth login', () => {
  it('exchanges a pasted redirect URL, including provider', async () => {
    const pending = loginWithClineBrowser({
      openUrl: async () => {},
      signal: new AbortController().signal,
      createCallback: async () => hangingCallback(),
      waitForManualCode: async () => 'http://127.0.0.1:48801/auth?code=pasted&provider=google',
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body['code']).toBe('pasted')
        expect(body['provider']).toBe('google')
        expect(body['redirect_uri']).toBe('http://127.0.0.1:48801/auth')
        return jsonResponse(tokenPayload())
      },
    })
    await expect(pending).resolves.toMatchObject({ accountId: 'cline-user-1', refresh: 'refresh-1' })
  })

  it('cancels when the abort signal fires while waiting', async () => {
    const controller = new AbortController()
    const pending = loginWithClineBrowser({
      openUrl: async () => {},
      signal: controller.signal,
      createCallback: async () => hangingCallback(),
    })
    controller.abort()
    await expect(pending).rejects.toThrow('Login cancelled')
  })
})

describe('Cline OAuth login session', () => {
  it('delivers a pasted code to the in-flight Cline login', async () => {
    const pending = startBrowserLogin(
      {
        openUrl: async () => {},
        fetchImpl: async () => jsonResponse(tokenPayload()),
        clineCallback: async () => hangingCallback(),
      },
      PROVIDER_ID,
    )
    expect(hasBrowserLogin(PROVIDER_ID)).toBe(true)
    submitBrowserLoginCode('pasted-code', PROVIDER_ID)
    await expect(pending).resolves.toMatchObject({ accountId: 'cline-user-1' })
    expect(hasBrowserLogin(PROVIDER_ID)).toBe(false)
  })

  it('keeps a Codex sign-in running while Cline is waiting', async () => {
    const hangingCodex = hangingCallback('unused')
    startBrowserLogin({
      openUrl: async () => {},
      createCallback: async () => hangingCodex,
    }).catch(() => {})
    expect(hasBrowserLogin('openai-codex')).toBe(true)

    const cline = startBrowserLogin(
      {
        openUrl: async () => {},
        fetchImpl: async () => jsonResponse(tokenPayload()),
        clineCallback: async () => hangingCallback(),
      },
      PROVIDER_ID,
    )
    expect(hasBrowserLogin('openai-codex')).toBe(true)
    submitBrowserLoginCode('cline-code', PROVIDER_ID)
    await expect(cline).resolves.toMatchObject({ accountId: 'cline-user-1' })
    expect(hasBrowserLogin('openai-codex')).toBe(true)
  })
})

describe('Cline OAuth loopback callback', () => {
  it('exchanges a real loopback bounce for tokens', async () => {
    const port = await findFreePort()
    const credential = await loginWithClineBrowser({
      openUrl: async (url) => {
        const callback = new URL(url).searchParams.get('callback_url')
        expect(callback).toBe('http://127.0.0.1:' + String(port) + CALLBACK_PATH)
        const response = await fetch(callback + '?code=loopback-code&provider=google')
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('Cline sign-in completed')
      },
      signal: new AbortController().signal,
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body['code']).toBe('loopback-code')
        expect(body['provider']).toBe('google')
        expect(body['client_type']).toBe(CLIENT_TYPE)
        return jsonResponse(tokenPayload())
      },
      createCallback: () => startClineOAuthServer({ ports: [port] }),
    })
    expect(credential).toMatchObject({ accountId: 'cline-user-1', refresh: 'refresh-1' })
  })

  it('rejects a bounce without a code and falls back to paste when the port is taken', async () => {
    const port = await findFreePort()
    const occupant = await startClineOAuthServer({ ports: [port] })
    try {
      const missing = await fetch('http://127.0.0.1:' + String(port) + '/nope')
      expect(missing.status).toBe(404)
      const empty = await fetch('http://127.0.0.1:' + String(port) + CALLBACK_PATH)
      expect(empty.status).toBe(400)
      await expect(occupant.waitForCode()).resolves.toEqual({ error: 'missing_code' })
      const fallback = await startClineOAuthServer({ ports: [port] })
      expect(fallback.callbackUrl).toBe('http://127.0.0.1:' + String(port) + CALLBACK_PATH)
      expect(await fallback.waitForCode()).toBeNull()
      fallback.close()
    } finally {
      occupant.cancel()
      occupant.close()
    }
  })
})
