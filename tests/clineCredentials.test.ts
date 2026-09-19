import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { REFRESH_URL } from '../backend/providers/cline/oauth'
import { writeOAuth, clearApiKey, hasStoredAuth } from '../backend/providers/credentialStore'
import { resolveAccessToken, resolveApiKey } from '../backend/providers/credentials'

describe('Cline OAuth credential refresh', () => {
  let agentDir: string
  let previous: string | undefined

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'black-cline-auth-'))
    previous = process.env['BLACK_AGENT_DIR']
    process.env['BLACK_AGENT_DIR'] = agentDir
  })

  afterEach(() => {
    if (previous === undefined) delete process.env['BLACK_AGENT_DIR']
    else process.env['BLACK_AGENT_DIR'] = previous
    rmSync(agentDir, { recursive: true, force: true })
  })

  it('returns a still-valid access token without hitting the network', async () => {
    writeOAuth('cline', {
      type: 'oauth',
      access: 'fresh-access',
      refresh: 'refresh',
      expires: Date.now() + 60 * 60 * 1000,
      accountId: 'cline-user',
    })
    expect(resolveApiKey('cline')).toBe('fresh-access')
    const resolved = await resolveAccessToken('cline', {
      fetchImpl: async () => {
        throw new Error('refresh should not run')
      },
    })
    expect(resolved).toBe('fresh-access')
  })

  it('refreshes an expired Cline token against Cline, not Codex', async () => {
    writeOAuth('cline', {
      type: 'oauth',
      access: 'old-access',
      refresh: 'old-refresh',
      expires: Date.now() - 1000,
      accountId: 'cline-user',
    })

    const resolved = await resolveAccessToken('cline', {
      fetchImpl: async (input, init) => {
        expect(input).toBe(REFRESH_URL)
        expect(String(input)).toContain('/api/v1/auth/refresh')
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(body).toEqual({ refreshToken: 'old-refresh', grantType: 'refresh_token' })
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              accessToken: 'new-access',
              refreshToken: 'new-refresh',
              tokenType: 'Bearer',
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
              userInfo: { subject: null, email: '', name: '', clineUserId: null, accounts: null },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    })
    expect(resolved).toBe('new-access')
    expect(resolveApiKey('cline')).toBe('new-access')
  })

  it('signs the user out when Cline rejects the refresh token', async () => {
    writeOAuth('cline', {
      type: 'oauth',
      access: 'old-access',
      refresh: 'dead-refresh',
      expires: Date.now() - 1000,
      accountId: 'cline-user',
    })
    const resolved = await resolveAccessToken('cline', {
      fetchImpl: async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 401 }),
    })
    expect(resolved).toBeUndefined()
    expect(hasStoredAuth('cline')).toBe(false)
    expect(resolveApiKey('cline')).toBeUndefined()
  })

  it('clears OAuth fields on sign-out', () => {
    writeOAuth('cline', {
      type: 'oauth',
      access: 'access',
      refresh: 'refresh',
      expires: Date.now() + 10000,
      accountId: 'cline-user',
    })
    expect(hasStoredAuth('cline')).toBe(true)
    clearApiKey('cline')
    expect(hasStoredAuth('cline')).toBe(false)
    expect(resolveApiKey('cline')).toBeUndefined()
  })
})
