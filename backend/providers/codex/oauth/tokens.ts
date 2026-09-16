import { CLIENT_ID, TOKEN_URL } from './constants'
import { accountIdFromAccessToken } from './jwt'
import type { OAuthCredential, OAuthToken } from './types'

type TokenOperation = 'exchange' | 'refresh'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function fetchWithLoginCancellation(
  doFetch: FetchLike,
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await doFetch(input, init)
  } catch (error) {
    if (init.signal?.aborted === true) throw new Error('Login cancelled')
    throw error
  }
}

async function readTokenResponse(response: Response, operation: TokenOperation): Promise<OAuthToken> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      'OpenAI Codex token ' + operation + ' failed (' + String(response.status) + '): ' + (text || response.statusText),
    )
  }

  const rawJson: unknown = await response.json()
  if (typeof rawJson !== 'object' || rawJson === null) {
    throw new Error('OpenAI Codex token ' + operation + ' response missing fields: ' + JSON.stringify(rawJson))
  }
  const json = rawJson as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown }
  if (
    typeof json.access_token !== 'string' ||
    json.access_token === '' ||
    typeof json.refresh_token !== 'string' ||
    json.refresh_token === '' ||
    typeof json.expires_in !== 'number' ||
    !Number.isFinite(json.expires_in)
  ) {
    throw new Error('OpenAI Codex token ' + operation + ' response missing fields: ' + JSON.stringify(json))
  }

  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
  }
}

export function credentialsFromToken(token: OAuthToken): OAuthCredential {
  return {
    type: 'oauth',
    access: token.access,
    refresh: token.refresh,
    expires: token.expires,
    accountId: accountIdFromAccessToken(token.access),
  }
}

export async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  redirectUri: string,
  signal: AbortSignal,
  doFetch: FetchLike = fetch,
): Promise<OAuthToken> {
  const response = await fetchWithLoginCancellation(doFetch, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
    signal,
  })
  return readTokenResponse(response, 'exchange')
}

export async function refreshAccessToken(
  refreshToken: string,
  signal: AbortSignal,
  doFetch: FetchLike = fetch,
): Promise<OAuthToken> {
  let response: Response
  try {
    response = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
      signal,
    })
  } catch (error) {
    if (signal.aborted) throw new Error('Login cancelled')
    throw new Error('OpenAI Codex token refresh error: ' + (error instanceof Error ? error.message : String(error)))
  }
  return readTokenResponse(response, 'refresh')
}

export async function exchangeAuthorizationCodeForCredentials(
  code: string,
  verifier: string,
  redirectUri: string,
  signal: AbortSignal,
  doFetch: FetchLike = fetch,
): Promise<OAuthCredential> {
  return credentialsFromToken(await exchangeAuthorizationCode(code, verifier, redirectUri, signal, doFetch))
}

export async function refreshOpenAICodexToken(
  refreshToken: string,
  signal: AbortSignal,
  doFetch: FetchLike = fetch,
): Promise<OAuthCredential> {
  return credentialsFromToken(await refreshAccessToken(refreshToken, signal, doFetch))
}
