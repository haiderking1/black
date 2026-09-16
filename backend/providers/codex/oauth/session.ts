import { PROVIDER_ID } from './constants'
import { loginWithBrowser } from './login'
import type { FetchLike } from './tokens'
import type { CreateCallback, OAuthCredential } from './types'

export interface LoginSessionOptions {
  openUrl: (url: string) => Promise<void>
  fetchImpl?: FetchLike
  createCallback?: CreateCallback
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

/**
 * One in-flight browser login per provider.
 *
 * Starting again cancels the previous attempt. A pasted code is delivered to
 * the same attempt the browser callback is racing, so the two cannot both
 * exchange.
 */
export function startBrowserLogin(options: LoginSessionOptions, providerId: string = PROVIDER_ID): Promise<OAuthCredential> {
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

  const promise = loginWithBrowser({
    openUrl: options.openUrl,
    signal: abort.signal,
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.createCallback !== undefined ? { createCallback: options.createCallback } : {}),
    waitForManualCode,
  }).finally(() => {
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

export function submitBrowserLoginCode(input: string, providerId: string = PROVIDER_ID): void {
  const trimmed = input.trim()
  if (trimmed === '') throw new Error('An authorization code is required')
  sessionFor(providerId).submitManual(trimmed)
}

export function cancelBrowserLogin(providerId: string = PROVIDER_ID): void {
  const session = pending.get(providerId)
  if (session === undefined) return
  session.abort.abort()
  pending.delete(providerId)
}

export function hasBrowserLogin(providerId: string = PROVIDER_ID): boolean {
  return pending.has(providerId)
}

export function browserLoginPromise(providerId: string = PROVIDER_ID): Promise<OAuthCredential> {
  return sessionFor(providerId).promise
}
