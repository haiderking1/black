import { AUTHORIZE_URL, CLIENT_ID, ORIGINATOR, REDIRECT_URI, SCOPE } from './constants'
import { createState, generatePKCE } from './pkce'

export interface AuthorizationFlow {
  verifier: string
  state: string
  url: string
}

export async function createAuthorizationFlow(originator: string = ORIGINATOR): Promise<AuthorizationFlow> {
  const { verifier, challenge } = await generatePKCE()
  const state = createState()

  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  url.searchParams.set('originator', originator)

  return { verifier, state, url: url.toString() }
}
