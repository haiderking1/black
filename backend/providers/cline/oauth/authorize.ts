import { AUTHORIZE_URL, CLIENT_TYPE } from './constants'

export function createAuthorizationUrl(callbackUrl: string): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_type', CLIENT_TYPE)
  url.searchParams.set('callback_url', callbackUrl)
  url.searchParams.set('redirect_uri', callbackUrl)
  return url.toString()
}
