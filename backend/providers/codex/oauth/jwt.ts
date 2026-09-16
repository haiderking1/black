import { JWT_CLAIM_PATH } from './constants'

interface JwtPayload {
  [JWT_CLAIM_PATH]?: {
    chatgpt_account_id?: string
  }
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    if (payload === undefined || payload === '') return null
    const parsed: unknown = JSON.parse(decodeBase64Url(payload))
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as JwtPayload
  } catch {
    return null
  }
}

export function accountIdFromAccessToken(accessToken: string): string {
  const payload = decodeJwt(accessToken)
  const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id
  if (typeof accountId !== 'string' || accountId.length === 0) {
    throw new Error('Failed to extract accountId from token')
  }
  return accountId
}
