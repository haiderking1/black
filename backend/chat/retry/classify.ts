import { isRetryableAssistantError } from './policy'
import { ProviderError } from '../../providers/errors'
import type { ChatStreamEvent } from '../../providers/types'

const permanent = /GoUsageLimitError|FreeUsageLimitError|insufficient_quota|quota.{0,20}(exceed|exhaust)|usage limit reached|available balance|out of budget|billing|insufficient credits|payment required|moderation|guardrail|no available (model )?provider|does not meet (your )?(routing )?requirements|invalid.{0,10}(api.?key|request)|unauthori[sz]ed|forbidden|context.{0,20}(length|window|exceed|overflow)|too many tokens/i
// Local transport wording not present in the reference provider catalog.
const localTransport = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|^network$|WebSocket connection closed|Provider connection ended before the round finished\./i
// OpenRouter puts this text on a 400 / invalid_request_error envelope for a dead host.
const serverCrash = /internal\s+server\s+error|internal_server_error/i

function isServerCrash(error: Pick<ChatStreamEvent, 'message' | 'errorCode'>): boolean {
  return serverCrash.test(error.message ?? '') || serverCrash.test(error.errorCode ?? '')
}

export function retryableModelError(error: Pick<ChatStreamEvent, 'message' | 'errorCode' | 'errorStatus'>): boolean {
  const crash = isServerCrash(error)
  if (permanent.test((error.errorCode ?? '') + ' ' + (error.message ?? '')) && !crash) return false
  const message = (error.errorCode ?? '') + ' ' + (error.message ?? '')
  let structuredTransient = crash
  if (error.errorStatus !== undefined) {
    structuredTransient = structuredTransient || [408, 409, 429].includes(error.errorStatus) || (error.errorStatus >= 500 && error.errorStatus <= 599)
    if (!structuredTransient) return false
  }
  if (!crash && (error.errorCode === 'auth' || error.errorCode === 'credits' || error.errorCode === 'bad_request' || error.errorCode === 'malformed_response')) return false
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
