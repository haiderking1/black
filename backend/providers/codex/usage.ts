import type { CodexUsage, CodexUsageWindow } from '../../../contracts/codexUsage'
import { describeError, messageFromBody, readErrorBody } from '../errors'
import type { FetchLike } from '../types'
import { accountIdFromAccessToken } from './oauth/jwt'
import { CODEX_BASE_URL, resolveCodexUsageUrl } from './endpoints'
import { buildCodexHeaders } from './headers'

export const CODEX_FIVE_HOUR_WINDOW_SECONDS = 5 * 60 * 60
export const CODEX_WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60

export interface CodexUsageOptions {
  accessToken: string
  baseUrl?: string
  fetchImpl?: FetchLike
  now?: () => number
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function parseWindow(value: unknown): CodexUsageWindow | undefined {
  const record = asRecord(value)
  if (record === undefined) return undefined
  const usedPercent = record['used_percent']
  const windowSeconds = record['limit_window_seconds']
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent)) return undefined
  if (typeof windowSeconds !== 'number' || !Number.isSafeInteger(windowSeconds) || windowSeconds <= 0) return undefined

  const rawResetAt = record['reset_at']
  const resetAt = typeof rawResetAt === 'number' && Number.isSafeInteger(rawResetAt) && rawResetAt > 0
    ? rawResetAt
    : null
  return {
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    windowSeconds,
    resetAt,
  }
}

function usageWindows(body: unknown): { weekly: CodexUsageWindow | null; fiveHour: CodexUsageWindow | null; planType: string | null } {
  const root = asRecord(body)
  const limits = asRecord(root?.['rate_limit'])
  if (limits === undefined) throw new Error('Codex usage response did not include rate limits.')

  const candidates = [parseWindow(limits['primary_window']), parseWindow(limits['secondary_window'])]
    .filter((window): window is CodexUsageWindow => window !== undefined)
  const weekly = candidates.find((window) =>
    window.windowSeconds >= CODEX_WEEKLY_WINDOW_SECONDS - 24 * 60 * 60 &&
    window.windowSeconds <= CODEX_WEEKLY_WINDOW_SECONDS + 24 * 60 * 60,
  )
  const fiveHour = candidates.find((window) =>
    window.windowSeconds >= CODEX_FIVE_HOUR_WINDOW_SECONDS - 60 * 60 &&
    window.windowSeconds <= CODEX_FIVE_HOUR_WINDOW_SECONDS + 60 * 60,
  )
  const rawPlan = root?.['plan_type']
  const planType = typeof rawPlan === 'string' && rawPlan.trim() !== '' ? rawPlan.trim() : null
  return { weekly: weekly ?? null, fiveHour: fiveHour ?? null, planType }
}

export function parseCodexUsage(body: unknown, fetchedAt = Date.now()): CodexUsage {
  if (!Number.isFinite(fetchedAt)) throw new Error('Codex usage timestamp was invalid.')
  const { weekly, fiveHour, planType } = usageWindows(body)
  if (weekly === null && fiveHour === null) {
    throw new Error('Codex usage response contained no weekly or 5-hour limits.')
  }
  return { weekly, fiveHour, planType, fetchedAt }
}

export async function fetchCodexUsage(options: CodexUsageOptions): Promise<CodexUsage> {
  const doFetch = options.fetchImpl ?? fetch
  const accountId = accountIdFromAccessToken(options.accessToken)
  const headers = buildCodexHeaders({
    accessToken: options.accessToken,
    accountId,
    accept: 'application/json',
    contentType: null,
  })

  let response: Response
  try {
    response = await doFetch(resolveCodexUsageUrl(options.baseUrl ?? CODEX_BASE_URL), {
      method: 'GET',
      headers,
    })
  } catch (error) {
    throw new Error('Codex usage request failed: ' + describeError(error))
  }

  if (!response.ok) {
    const body = await readErrorBody(response)
    const detail = messageFromBody(body, 'The provider returned no error details.')
    throw new Error('Codex usage request failed (' + response.status + '): ' + detail)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Codex usage response was not valid JSON.')
  }
  return parseCodexUsage(body, options.now?.() ?? Date.now())
}
