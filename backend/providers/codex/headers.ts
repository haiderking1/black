import { arch, platform, release } from 'node:os'

import { ORIGINATOR } from './oauth/constants'
import { OPENAI_BETA_RESPONSES } from './endpoints'

export function userAgent(): string {
  return ORIGINATOR + ' (' + platform() + ' ' + release() + '; ' + arch() + ')'
}

export function buildCodexHeaders(options: {
  accessToken: string
  accountId: string
  sessionId?: string
  accept?: string
  contentType?: string | null
}): Headers {
  const headers = new Headers()
  headers.set('Authorization', 'Bearer ' + options.accessToken)
  headers.set('chatgpt-account-id', options.accountId)
  headers.set('originator', ORIGINATOR)
  headers.set('User-Agent', userAgent())
  headers.set('OpenAI-Beta', OPENAI_BETA_RESPONSES)
  headers.set('accept', options.accept ?? 'text/event-stream')
  if (options.contentType !== null) headers.set('content-type', options.contentType ?? 'application/json')
  if (options.sessionId !== undefined && options.sessionId !== '') {
    headers.set('session-id', options.sessionId)
    headers.set('x-client-request-id', options.sessionId)
  }
  return headers
}
