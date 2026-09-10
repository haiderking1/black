import { isRetryableAssistantError } from './reference/retry'
import { ProviderError } from '../../providers/errors'
import type { ChatStreamEvent } from '../../providers/types'

const permanent = /GoUsageLimitError|FreeUsageLimitError|insufficient_quota|quota.{0,20}(exceed|exhaust)|usage limit reached|available balance|out of budget|billing|invalid.{0,10}(api.?key|request)|unauthori[sz]ed|forbidden|context.{0,20}(length|window|exceed|overflow)|too many tokens/i
// Local transport wording not present in the reference provider catalog.
const localTransport = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|^network$|WebSocket connection closed|Provider connection ended before the round finished\./i

export function retryableModelError(error: Pick<ChatStreamEvent, 'message' | 'errorCode' | 'errorStatus'>): boolean {
  if (permanent.test((error.errorCode ?? '') + ' ' + (error.message ?? ''))) return false
  const message = (error.errorCode ?? '') + ' ' + (error.message ?? '')
  let structuredTransient = false
  if (error.errorStatus !== undefined) {
    structuredTransient = [408, 409, 429].includes(error.errorStatus) || (error.errorStatus >= 500 && error.errorStatus <= 599)
    if (!structuredTransient) return false
  }
  if (error.errorCode === 'auth' || error.errorCode === 'bad_request' || error.errorCode === 'malformed_response') return false
  structuredTransient ||= ['network', 'rate_limit', 'server'].includes(error.errorCode ?? '') || localTransport.test(error.message ?? '')
  return isRetryableAssistantError({
    stopReason: 'error',
    errorMessage: message + (structuredTransient ? ' network error' : ''),
  })
}

export function modelErrorEvent(error: unknown): ChatStreamEvent {
  return {
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof ProviderError ? { errorCode: error.code, ...(error.status === undefined ? {} : { errorStatus: error.status }) } : {}),
  }
}
