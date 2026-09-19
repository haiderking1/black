/**
 * Cline browser OAuth constants.
 *
 * `client_type=extension` and the 48801-48811 loopback range are what Cline's
 * own client registers. Changing them makes authorize reject the bounce.
 */

import { AUTHORIZE_PATH, CLINE_API_BASE_URL, joinUrl, REFRESH_PATH, TOKEN_PATH } from '../endpoints'

export const PROVIDER_ID = 'cline'
export const CLIENT_TYPE = 'extension'
export const API_BASE_URL = CLINE_API_BASE_URL
export const AUTHORIZE_URL = joinUrl(CLINE_API_BASE_URL, AUTHORIZE_PATH)
export const TOKEN_URL = joinUrl(CLINE_API_BASE_URL, TOKEN_PATH)
export const REFRESH_URL = joinUrl(CLINE_API_BASE_URL, REFRESH_PATH)
export const CALLBACK_HOST = '127.0.0.1'
export const CALLBACK_PATH = '/auth'
export const CALLBACK_PORTS: readonly number[] = Array.from({ length: 11 }, (_, index) => 48801 + index)

export function callbackUrlFor(port: number, host: string = CALLBACK_HOST): string {
  return 'http://' + host + ':' + String(port) + CALLBACK_PATH
}
