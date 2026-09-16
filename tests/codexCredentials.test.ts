import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeOAuth, clearApiKey, hasStoredAuth } from '../backend/providers/credentialStore'
import { resolveAccessToken, resolveApiKey } from '../backend/providers/credentials'
import { TOKEN_URL } from '../backend/providers/codex/oauth'

function accessToken(accountId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } }),
  ).toString('base64url')
  return 'hdr.' + payload + '.sig'
}

describe('Codex OAuth credential refresh', () => {
  let agentDir: string
  let previous: string | undefined

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'black-codex-auth-'))
    previous = process.env['BLACK_AGENT_DIR']
    process.env['BLACK_AGENT_DIR'] = agentDir
  })

  afterEach(() => {
    if (previous === undefined) delete process.env['BLACK_AGENT_DIR']
    else process.env['BLACK_AGENT_DIR'] = previous
    rmSync(agentDir, { recursive: true, force: true })
  })

  it('returns a still-valid access token without hitting the network', async () => {
    const token = accessToken('acct-fresh')
    writeOAuth('openai-codex', {
      type: 'oauth',
      access: token,
      refresh: 'refresh',
      expires: Date.now() + 60 * 60 * 1000,
      accountId: 'acct-fresh',
    })
    expect(resolveApiKey('openai-codex')).toBe(token)
    const resolved = await resolveAccessToken('openai-codex', {
      fetchImpl: async () => {
        throw new Error('refresh should not run')
      },
    })
    expect(resolved).toBe(token)
  })

  it('refreshes once when two turns race an expired token', async () => {
    writeOAuth('openai-codex', {
      type: 'oauth',
      access: accessToken('acct-old'),
      refresh: 'old-refresh',
      expires: Date.now() - 1000,
      accountId: 'acct-old',
    })

    let calls = 0
    const next = accessToken('acct-new')
    const fetchImpl = async (input: string): Promise<Response> => {
      calls += 1
      expect(input).toBe(TOKEN_URL)
      await new Promise((resolve) => setTimeout(resolve, 20))
      return new Response(
        JSON.stringify({ access_token: next, refresh_token: 'new-refresh', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const [first, second] = await Promise.all([
      resolveAccessToken('openai-codex', { fetchImpl }),
      resolveAccessToken('openai-codex', { fetchImpl }),
    ])
    expect(first).toBe(next)
    expect(second).toBe(next)
    expect(calls).toBe(1)
    expect(resolveApiKey('openai-codex')).toBe(next)
  })

  it('refreshes when fewer than five minutes remain', async () => {
    writeOAuth('openai-codex', {
      type: 'oauth',
      access: accessToken('acct-soon'),
      refresh: 'soon-refresh',
      expires: Date.now() + 60 * 1000,
      accountId: 'acct-soon',
    })
    const next = accessToken('acct-later')
    const resolved = await resolveAccessToken('openai-codex', {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ access_token: next, refresh_token: 'later', expires_in: 3600 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    })
    expect(resolved).toBe(next)
  })

  it('clears OAuth fields on sign-out', () => {
    writeOAuth('openai-codex', {
      type: 'oauth',
      access: accessToken('acct'),
      refresh: 'refresh',
      expires: Date.now() + 10000,
      accountId: 'acct',
    })
    expect(hasStoredAuth('openai-codex')).toBe(true)
    clearApiKey('openai-codex')
    expect(hasStoredAuth('openai-codex')).toBe(false)
    expect(resolveApiKey('openai-codex')).toBeUndefined()
  })
})
