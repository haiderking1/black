import { describe, expect, it } from 'bun:test'
import { fetchCodexUsage, parseCodexUsage } from '../backend/providers/codex/usage'
import { resolveCodexUsageUrl } from '../backend/providers/codex/endpoints'

function accessToken(): string {
  const payload = Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: 'account-123' },
  })).toString('base64url')
  return 'header.' + payload + '.signature'
}

const usagePayload = {
  plan_type: 'plus',
  rate_limit: {
    primary_window: { used_percent: 42.5, limit_window_seconds: 18000, reset_at: 2_000_000_000 },
    secondary_window: { used_percent: 68, limit_window_seconds: 604800, reset_at: 2_000_500_000 },
  },
}

describe('Codex subscription usage', () => {
  it('resolves the usage route from supported Codex base URL forms', () => {
    expect(resolveCodexUsageUrl()).toBe('https://chatgpt.com/backend-api/wham/usage')
    expect(resolveCodexUsageUrl('https://example.test/backend-api')).toBe('https://example.test/backend-api/wham/usage')
    expect(resolveCodexUsageUrl('https://example.test/backend-api/codex')).toBe('https://example.test/backend-api/wham/usage')
    expect(resolveCodexUsageUrl('https://example.test/backend-api/codex/responses')).toBe('https://example.test/backend-api/wham/usage')
  })

  it('classifies weekly and rolling five-hour windows by their durations', () => {
    expect(parseCodexUsage(usagePayload, 1234)).toEqual({
      planType: 'plus',
      fetchedAt: 1234,
      weekly: { usedPercent: 68, windowSeconds: 604800, resetAt: 2_000_500_000 },
      fiveHour: { usedPercent: 42.5, windowSeconds: 18000, resetAt: 2_000_000_000 },
    })
  })

  it('keeps weekly-only accounts and clamps invalid provider percentages for display', () => {
    expect(parseCodexUsage({ rate_limit: {
      primary_window: { used_percent: 125, limit_window_seconds: 604800, reset_at: 'bad' },
      secondary_window: null,
    } })).toMatchObject({
      weekly: { usedPercent: 100, windowSeconds: 604800, resetAt: null },
      fiveHour: null,
    })
  })

  it('rejects payloads with no usable quota windows', () => {
    expect(() => parseCodexUsage({ rate_limit: { primary_window: { used_percent: 20 } } }))
      .toThrow('Codex usage response contained no weekly or 5-hour limits.')
  })

  it('calls the authenticated usage endpoint with the account id and preserves provider errors', async () => {
    let requestedUrl = ''
    let headers: Headers | undefined
    const result = await fetchCodexUsage({
      accessToken: accessToken(),
      now: () => 1234,
      fetchImpl: async (url, init) => {
        requestedUrl = String(url)
        headers = new Headers(init?.headers)
        return new Response(JSON.stringify(usagePayload), { status: 200 })
      },
    })
    expect(requestedUrl).toBe('https://chatgpt.com/backend-api/wham/usage')
    expect(headers?.get('authorization')).toBe('Bearer ' + accessToken())
    expect(headers?.get('chatgpt-account-id')).toBe('account-123')
    expect(result.weekly?.usedPercent).toBe(68)
    expect(result.fetchedAt).toBe(1234)

    await expect(fetchCodexUsage({
      accessToken: accessToken(),
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Session expired' } }), { status: 401 }),
    })).rejects.toThrow('Codex usage request failed (401): Session expired')
  })
})
