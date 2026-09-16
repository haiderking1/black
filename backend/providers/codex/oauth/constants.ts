/**
 * ChatGPT Codex OAuth protocol constants.
 *
 * The client id and redirect URI are the ones registered for the Codex CLI
 * OAuth app. Changing either of them makes the authorize endpoint reject the
 * request, so they stay verbatim.
 */

export const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const AUTH_BASE_URL = 'https://auth.openai.com'
export const AUTHORIZE_URL = AUTH_BASE_URL + '/oauth/authorize'
export const TOKEN_URL = AUTH_BASE_URL + '/oauth/token'
export const REDIRECT_URI = 'http://localhost:1455/auth/callback'
export const CALLBACK_PATH = '/auth/callback'
export const CALLBACK_PORT = 1455
export const CALLBACK_HOST = '127.0.0.1'
export const SCOPE = 'openid profile email offline_access'
export const JWT_CLAIM_PATH = 'https://api.openai.com/auth'
export const ORIGINATOR = 'black'
export const PROVIDER_ID = 'openai-codex'
