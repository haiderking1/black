import { describeError, messageFromBody, readErrorBody } from '../../errors'
import type { OAuthCredential } from '../../codex/oauth/types'
import { CLIENT_TYPE, REFRESH_URL, TOKEN_URL } from './constants'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type TokenOperation = 'exchange' | 'refresh'

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

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function readUserInfo(value: unknown): { clineUserId?: string; email?: string; subject?: string } {
  if (typeof value !== 'object' || value === null) return {}
  const record = value as Record<string, unknown>
  return {
    ...(nonEmpty(record['clineUserId']) !== undefined ? { clineUserId: nonEmpty(record['clineUserId']) } : {}),
    ...(nonEmpty(record['email']) !== undefined ? { email: nonEmpty(record['email']) } : {}),
    ...(nonEmpty(record['subject']) !== undefined ? { subject: nonEmpty(record['subject']) } : {}),
  }
}

export class ClineAuthRefreshError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ClineAuthRefreshError'
    this.status = status
  }
}

export function isClineAuthRefreshError(error: unknown): error is ClineAuthRefreshError {
  return error instanceof ClineAuthRefreshError
}

function accountIdFrom(
  userInfo: { clineUserId?: string; email?: string; subject?: string },
  fallback?: string,
): string | undefined {
  return userInfo.clineUserId ?? fallback ?? userInfo.email ?? userInfo.subject
}

function parseExpiresAt(value: unknown): number {
  if (typeof value !== 'string' || value === '') {
    throw new Error('Cline token response missing fields: expiresAt')
  }
  const expires = Date.parse(value)
  if (!Number.isFinite(expires)) {
    throw new Error('Cline token response missing fields: expiresAt')
  }
  return expires
}

function readTokenResponse(
  rawJson: unknown,
  operation: TokenOperation,
  fallback?: OAuthCredential,
): OAuthCredential {
  if (typeof rawJson !== 'object' || rawJson === null) {
    throw new Error('Cline token ' + operation + ' response missing fields: ' + JSON.stringify(rawJson))
  }

  const envelope = rawJson as { success?: unknown; data?: unknown }
  if (envelope.success !== true || typeof envelope.data !== 'object' || envelope.data === null) {
    throw new Error('Cline token ' + operation + ' response missing fields: ' + JSON.stringify(rawJson))
  }

  const data = envelope.data as {
    accessToken?: unknown
    refreshToken?: unknown
    expiresAt?: unknown
    userInfo?: unknown
  }
  const access = nonEmpty(data.accessToken)
  const refresh = nonEmpty(data.refreshToken) ?? fallback?.refresh
  if (access === undefined || refresh === undefined) {
    throw new Error('Cline token ' + operation + ' response missing fields: ' + JSON.stringify(rawJson))
  }

  const userInfo = readUserInfo(data.userInfo)
  const accountId = accountIdFrom(userInfo, fallback?.accountId)
  if (accountId === undefined) {
    throw new Error('Cline token ' + operation + ' response missing fields: accountId')
  }
  return {
    type: 'oauth',
    access,
    refresh,
    expires: parseExpiresAt(data.expiresAt),
    accountId,
  }
}

async function readJsonResponse(response: Response, operation: TokenOperation): Promise<unknown> {
  if (!response.ok) {
    const body = await readErrorBody(response)
    const detail = messageFromBody(body, response.statusText || 'The token service returned no error details.')
    throw new Error('Cline token ' + operation + ' failed (' + String(response.status) + '): ' + detail)
  }
  return response.json()
}

export async function exchangeAuthorizationCodeForCredentials(
  code: string,
  redirectUri: string,
  signal: AbortSignal,
  doFetch: FetchLike = fetch,
  provider?: string,
): Promise<OAuthCredential> {
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    client_type: CLIENT_TYPE,
    redirect_uri: redirectUri,
  }
  if (provider !== undefined && provider !== '') body['provider'] = provider

  const response = await fetchWithLoginCancellation(doFetch, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return readTokenResponse(await readJsonResponse(response, 'exchange'), 'exchange')
}

export async function refreshClineToken(
  current: OAuthCredential,
  signal: AbortSignal,
  doFetch: FetchLike = fetch,
): Promise<OAuthCredential> {
  let response: Response
  try {
    response = await doFetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: current.refresh,
        grantType: 'refresh_token',
      }),
      signal,
    })
  } catch (error) {
    if (signal.aborted) throw new Error('Login cancelled')
    throw new Error('Cline token refresh error: ' + describeError(error))
  }
  if (!response.ok && (response.status === 400 || response.status === 401 || response.status === 403)) {
    const text = await response.text().catch(() => '')
    throw new ClineAuthRefreshError(
      response.status,
      'Cline token refresh failed (' + String(response.status) + '): ' + (text || response.statusText),
    )
  }
  return readTokenResponse(await readJsonResponse(response, 'refresh'), 'refresh', current)
}
