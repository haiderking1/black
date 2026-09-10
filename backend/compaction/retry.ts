/**
 * Retry for summarization calls.
 *
 * A summarization call is a single request over a long session. When the
 * transport drops mid-stream, another attempt costs a few seconds; giving up
 * loses the checkpoint or the branch summary entirely. This loop retries
 * transient transport and provider failures with exponential backoff and fails
 * fast on deterministic ones, so a quota error does not spin for a minute.
 *
 * Adapted from pi's retry utility (https://github.com/earendil-works/pi, MIT,
 * Mario Zechner) so black can retry without a provider layer: the wrapper
 * composes with any SummarizationCall.
 */

import type { AssistantMessage } from '../sessions/types'
import type { SummarizationCall, SummarizationRequest } from './types'

/** Cap on one backoff delay. */
export const DEFAULT_MAX_RETRY_DELAY_MS = 60_000

/**
 * Largest delay setTimeout can represent. Anything above this is clamped to
 * 1ms by the runtime, which would turn a long backoff into a request storm.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/**
 * A usable retry count, or the fallback. A count that is not a finite number
 * would make the attempt comparison permanently false and retry forever, so it
 * is never trusted as-is.
 */
function retryCount(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return Math.floor(value)
}

export interface RetryPolicy {
  enabled: boolean
  /** Attempts after the first call. 0 keeps the first result whatever it is. */
  maxRetries: number
  /** First backoff delay. Each further attempt doubles it. */
  baseDelayMs: number
  /** Cap applied to every computed delay. Defaults to 60 seconds. */
  maxRetryDelayMs?: number
}

export interface RetryCallbacks {
  /** Before the backoff sleep of a retry, 1-indexed. */
  onRetryScheduled?: (
    attempt: number,
    maxAttempts: number,
    delayMs: number,
    errorMessage: string
  ) => void | Promise<void>
  /** After the sleep, immediately before the retried call starts. */
  onRetryAttemptStart?: () => void | Promise<void>
  /** Once when the loop ends, whether a later attempt succeeded or it gave up. */
  onRetryFinished?: (success: boolean, attempt: number, finalError?: string) => void | Promise<void>
}

/**
 * Failures that will not improve by asking again. Checked first, so a message
 * mentioning both a quota and a status code stays non-retryable.
 */
const NON_RETRYABLE_PATTERN = new RegExp(
  [
    // Subscription and free-tier limits an API reports as a 429 but which will
    // not clear on their own.
    'GoUsageLimitError',
    'FreeUsageLimitError',
    'available balance',
    'usage limit',
    'quota',
    'out of budget',
    'billing',
    'insufficient balance',
    'not enough credits'
  ].join('|'),
  'i'
)

/** Transport, throttling, and provider-side failures worth another attempt. */
const RETRYABLE_PATTERN = new RegExp(
  [
    'overloaded',
    'rate.?limit',
    'too many requests',
    // Word boundaries are deliberate. pi matches these digits anywhere in the
    // message, which would also catch an unrelated number such as a token count.
    '\\b(429|500|502|503|504|524)\\b',
    'service.?unavailable',
    'server.?error',
    'internal.?error',
    'provider.?returned.?error',
    'exceeded request buffer limit',
    'upstream.?connect',
    'reset before headers',
    'http2 request did not get a response',
    'you can retry your request',
    'ResourceExhausted',
    'network.?error',
    'connection.?error',
    'connection.?refused',
    'connection.?lost',
    'other side closed',
    'fetch failed',
    'getaddrinfo',
    'ENOTFOUND',
    'EAI_AGAIN',
    'socket hang up',
    'socket connection was closed',
    'timed? out',
    'timeout',
    'terminated',
    'websocket.?(closed|error)',
    'ended without',
    'stream ended before',
    'retry delay',
    'try your request again',
    'please retry'
  ].join('|'),
  'i'
)

/** Whether a failed response looks transient enough to be worth another attempt. */
export function isRetryableSummarizationError(response: AssistantMessage): boolean {
  if (response.stopReason !== 'error') return false
  const message = response.errorMessage
  if (typeof message !== 'string' || message === '') return false
  if (NON_RETRYABLE_PATTERN.test(message)) return false
  return RETRYABLE_PATTERN.test(message)
}

/**
 * Backoff for one attempt: baseDelayMs doubled per attempt, clamped to the cap.
 * Values that are not usable numbers fall back rather than producing NaN.
 */
export function retryDelayMs(
  policy: Pick<RetryPolicy, 'baseDelayMs' | 'maxRetryDelayMs'>,
  attempt: number
): number {
  const configuredBase = policy.baseDelayMs
  // An unusable base falls through to the cap rather than to zero, so a bad
  // setting cannot produce an unthrottled retry loop.
  const base =
    typeof configuredBase === 'number' && Number.isFinite(configuredBase) && configuredBase >= 0
      ? configuredBase
      : Number.MAX_SAFE_INTEGER

  const configuredCap = policy.maxRetryDelayMs
  const cap =
    typeof configuredCap === 'number' && Number.isFinite(configuredCap) && configuredCap > 0
      ? configuredCap
      : DEFAULT_MAX_RETRY_DELAY_MS

  const rawDelay = base * 2 ** Math.max(0, attempt - 1)
  const safeDelay = Number.isSafeInteger(rawDelay) ? rawDelay : Number.MAX_SAFE_INTEGER
  return Math.min(safeDelay, cap, MAX_TIMER_DELAY_MS)
}

/**
 * Build a policy from settings. Provider-level maxRetries wins over the agent
 * level one, so a transport-specific override is respected when present.
 */
export function summarizationRetryPolicy(
  retry: { enabled: boolean; maxRetries: number; baseDelayMs: number },
  provider?: { maxRetries?: number; maxRetryDelayMs?: number }
): RetryPolicy {
  const maxRetries = retryCount(provider?.maxRetries, retryCount(retry.maxRetries, 0))

  return {
    enabled: retry.enabled,
    maxRetries,
    baseDelayMs: retry.baseDelayMs,
    maxRetryDelayMs: provider?.maxRetryDelayMs
  }
}

/** Thrown internally when an abort lands during a backoff sleep. */
class RetrySleepAbortError extends Error {
  constructor() {
    super('Aborted')
    this.name = 'RetrySleepAbortError'
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new RetrySleepAbortError())
      return
    }
    if (!Number.isFinite(ms) || ms <= 0) {
      resolve()
      return
    }

    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new RetrySleepAbortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Wrap a summarization call so transient failures are retried.
 *
 * The wrapper returns whatever the last attempt produced, so callers keep using
 * the same response inspection: an exhausted loop still reads as a failed
 * response with its error message attached. An abort is terminal and never
 * retried, and an abort during backoff comes back as an aborted response so the
 * caller does not have to care when cancellation happened.
 */
export function retrySummarizationCall(
  call: SummarizationCall,
  policy: RetryPolicy | undefined,
  callbacks?: RetryCallbacks
): SummarizationCall {
  const activePolicy = policy?.enabled === true ? policy : undefined
  const maxAttempts = activePolicy !== undefined ? retryCount(activePolicy.maxRetries, 0) : 0

  return async (request: SummarizationRequest): Promise<AssistantMessage> => {
    let attempt = 0
    let lastRetry: { attempt: number; errorMessage: string } | undefined

    for (;;) {
      const response = await call(request)

      if (response.stopReason === 'aborted') {
        if (lastRetry !== undefined) await callbacks?.onRetryFinished?.(false, lastRetry.attempt)
        return response
      }

      if (response.stopReason !== 'error') {
        if (lastRetry !== undefined) await callbacks?.onRetryFinished?.(true, lastRetry.attempt)
        return response
      }

      if (activePolicy === undefined || attempt >= maxAttempts || !isRetryableSummarizationError(response)) {
        if (lastRetry !== undefined) {
          await callbacks?.onRetryFinished?.(false, lastRetry.attempt, response.errorMessage)
        }
        return response
      }

      attempt++
      const errorMessage =
        typeof response.errorMessage === 'string' && response.errorMessage !== ''
          ? response.errorMessage
          : 'Unknown error'
      lastRetry = { attempt, errorMessage }

      const delayMs = retryDelayMs(activePolicy, attempt)
      await callbacks?.onRetryScheduled?.(attempt, maxAttempts, delayMs, errorMessage)

      try {
        await sleep(delayMs, request.signal)
      } catch (error) {
        await callbacks?.onRetryFinished?.(false, attempt, errorMessage)
        if (error instanceof RetrySleepAbortError) {
          const { errorMessage: _dropped, ...rest } = response
          return { ...rest, stopReason: 'aborted' }
        }
        throw error
      }

      await callbacks?.onRetryAttemptStart?.()
    }
  }
}
