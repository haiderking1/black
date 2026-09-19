/**
 * In-flight browser login, keyed by provider.
 *
 * Codex and Cline both bounce through a loopback callback and race a pasted
 * code. The pending map is shared so cancel and submit land on the attempt
 * that is actually waiting.
 */

import { PROVIDER_ID as CLINE_ID } from '../cline/oauth/constants'
import { loginWithClineBrowser, type ClineCallbackWaiter } from '../cline/oauth'
import { PROVIDER_ID as CODEX_ID } from '../codex/oauth/constants'
import { loginWithBrowser } from '../codex/oauth/login'
import type { FetchLike } from '../codex/oauth/tokens'
import type { CreateCallback, OAuthCredential } from '../codex/oauth/types'

export interface LoginSessionOptions {
  openUrl: (url: string) => Promise<void>
  fetchImpl?: FetchLike
  createCallback?: CreateCallback
  clineCallback?: () => Promise<ClineCallbackWaiter>
}

interface PendingLogin {
  abort: AbortController
  submitManual: (input: string) => void
  promise: Promise<OAuthCredential>
}

const pending = new Map<string, PendingLogin>()

function sessionFor(providerId: string): PendingLogin {
  const session = pending.get(providerId)
  if (session === undefined) throw new Error('No sign-in in progress')
  return session
}

function startProviderLogin(
  providerId: string,
  options: LoginSessionOptions,
  signal: AbortSignal,
  waitForManualCode: () => Promise<string>,
): Promise<OAuthCredential> {
  const shared = {
    openUrl: options.openUrl,
    signal,
    waitForManualCode,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  }

  if (providerId === CLINE_ID) {
    return loginWithClineBrowser({
      ...shared,
      ...(options.clineCallback !== undefined ? { createCallback: options.clineCallback } : {}),
    })
  }

  if (providerId === CODEX_ID) {
    return loginWithBrowser({
      ...shared,
      ...(options.createCallback !== undefined ? { createCallback: options.createCallback } : {}),
    })
  }

  throw new Error(providerId + ' does not use browser sign-in')
}

/**
 * One in-flight browser login per provider.
 *
 * Starting again cancels the previous attempt. A pasted code is delivered to
 * the same attempt the browser callback is racing, so the two cannot both
 * exchange.
 */
export function startBrowserLogin(
  options: LoginSessionOptions,
  providerId: string = CODEX_ID,
): Promise<OAuthCredential> {
  cancelBrowserLogin(providerId)

  const abort = new AbortController()
  let settleManual: ((input: string) => void) | undefined
  let rejectManual: ((error: Error) => void) | undefined
  const manualPromise = new Promise<string>((resolve, reject) => {
    settleManual = resolve
    rejectManual = reject
  })
  void manualPromise.catch(() => {})
  const waitForManualCode = () => manualPromise

  abort.signal.addEventListener(
    'abort',
    () => {
      rejectManual?.(new Error('Login cancelled'))
    },
    { once: true },
  )

  const promise = startProviderLogin(providerId, options, abort.signal, waitForManualCode).finally(() => {
    if (pending.get(providerId)?.abort === abort) pending.delete(providerId)
  })

  pending.set(providerId, {
    abort,
    submitManual: (input) => {
      if (settleManual === undefined) throw new Error('No sign-in in progress')
      settleManual(input)
    },
    promise,
  })

  return promise
}

export function submitBrowserLoginCode(input: string, providerId: string = CODEX_ID): void {
  const trimmed = input.trim()
  if (trimmed === '') throw new Error('An authorization code is required')
  sessionFor(providerId).submitManual(trimmed)
}

export function cancelBrowserLogin(providerId: string = CODEX_ID): void {
  const session = pending.get(providerId)
  if (session === undefined) return
  session.abort.abort()
  pending.delete(providerId)
}

export function hasBrowserLogin(providerId: string = CODEX_ID): boolean {
  return pending.has(providerId)
}

export function browserLoginPromise(providerId: string = CODEX_ID): Promise<OAuthCredential> {
  return sessionFor(providerId).promise
}
