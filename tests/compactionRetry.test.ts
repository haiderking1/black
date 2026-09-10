import { describe, expect, it } from 'bun:test'
import {
  isRetryableSummarizationError,
  retryDelayMs,
  retrySummarizationCall,
  summarizationRetryPolicy,
} from '../backend/compaction/retry'
import type { SummarizationCall, SummarizationRequest } from '../backend/compaction/types'
import type { AssistantMessage, Usage } from '../backend/sessions/types'

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

function ok(text = 'TEXT'): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
  }
}

function failure(errorMessage: string): AssistantMessage {
  return { ...ok(''), stopReason: 'error', errorMessage }
}

function aborted(): AssistantMessage {
  return { ...ok(''), stopReason: 'aborted' }
}

/** Replies with the queued responses in order, repeating the last one. */
function sequenceCall(responses: AssistantMessage[]): {
  call: SummarizationCall
  requests: SummarizationRequest[]
} {
  const requests: SummarizationRequest[] = []
  let index = 0
  const call: SummarizationCall = async (request) => {
    requests.push(request)
    const response = responses[Math.min(index, responses.length - 1)]
    index++
    return response ?? failure('no response queued')
  }
  return { call, requests }
}

const REQUEST: SummarizationRequest = { systemPrompt: 'sys', text: 'body', maxTokens: 10 }

const FAST = { enabled: true, maxRetries: 2, baseDelayMs: 1 }

describe('retryDelayMs', () => {
  it('doubles the base delay per attempt', () => {
    const policy = { baseDelayMs: 1000 }
    expect(retryDelayMs(policy, 1)).toBe(1000)
    expect(retryDelayMs(policy, 2)).toBe(2000)
    expect(retryDelayMs(policy, 3)).toBe(4000)
  })

  it('treats attempt zero or lower as the first attempt', () => {
    expect(retryDelayMs({ baseDelayMs: 500 }, 0)).toBe(500)
    expect(retryDelayMs({ baseDelayMs: 500 }, -3)).toBe(500)
  })

  it('clamps to the configured cap and defaults it to one minute', () => {
    expect(retryDelayMs({ baseDelayMs: 1000, maxRetryDelayMs: 3000 }, 5)).toBe(3000)
    expect(retryDelayMs({ baseDelayMs: 100_000 }, 1)).toBe(60_000)
  })

  it('falls back to the cap for unusable input rather than to no delay', () => {
    // Falling back to zero would retry with no spacing at all, so garbage
    // settings land on the configured cap instead.
    expect(retryDelayMs({ baseDelayMs: Number.NaN }, 1)).toBe(60_000)
    expect(retryDelayMs({ baseDelayMs: -5 }, 1)).toBe(60_000)
    expect(retryDelayMs({ baseDelayMs: 1000, maxRetryDelayMs: Number.NaN }, 1)).toBe(1000)
  })

  it('never exceeds what a timer can represent', () => {
    // Above 2^31-1 the runtime clamps setTimeout to 1ms, which would spin.
    expect(retryDelayMs({ baseDelayMs: 1000, maxRetryDelayMs: Number.MAX_SAFE_INTEGER }, 200)).toBe(2_147_483_647)
    expect(retryDelayMs({ baseDelayMs: 4_294_967_296, maxRetryDelayMs: Number.MAX_SAFE_INTEGER }, 1)).toBe(
      2_147_483_647,
    )
    // The ordinary cap still wins when it is lower.
    expect(retryDelayMs({ baseDelayMs: 4_294_967_296 }, 1)).toBe(60_000)
  })
})

describe('isRetryableSummarizationError', () => {
  it('ignores responses that are not errors', () => {
    expect(isRetryableSummarizationError(ok())).toBe(false)
    expect(isRetryableSummarizationError(aborted())).toBe(false)
  })

  it('ignores errors with no message to classify', () => {
    expect(isRetryableSummarizationError({ ...ok(), stopReason: 'error' })).toBe(false)
    expect(isRetryableSummarizationError(failure(''))).toBe(false)
  })

  it('accepts transport and provider failures', () => {
    for (const message of [
      'fetch failed',
      'socket hang up',
      'ECONNRESET: connection lost',
      '429 too many requests',
      'HTTP 503 service unavailable',
      'upstream is overloaded',
      'stream ended before message_stop',
      'request timed out',
    ]) {
      expect(isRetryableSummarizationError(failure(message))).toBe(true)
    }
  })

  it('rejects deterministic failures', () => {
    for (const message of [
      'insufficient_quota',
      'You have exceeded your usage limit',
      'quota exceeded for this month',
      'billing issue on the account',
      'not enough credits',
    ]) {
      expect(isRetryableSummarizationError(failure(message))).toBe(false)
    }
  })

  it('keeps a deterministic failure deterministic when both patterns match', () => {
    expect(isRetryableSummarizationError(failure('quota exceeded, retry after 429'))).toBe(false)
  })
})

describe('summarizationRetryPolicy', () => {
  const agent = { enabled: true, maxRetries: 3, baseDelayMs: 2000 }

  it('uses the agent level retry count by default', () => {
    expect(summarizationRetryPolicy(agent).maxRetries).toBe(3)
    expect(summarizationRetryPolicy(agent, {}).maxRetries).toBe(3)
  })

  it('lets a provider level override win', () => {
    expect(summarizationRetryPolicy(agent, { maxRetries: 1 }).maxRetries).toBe(1)
    expect(summarizationRetryPolicy(agent, { maxRetries: 0 }).maxRetries).toBe(0)
  })

  it('ignores an unusable provider retry count in favour of the agent level one', () => {
    expect(summarizationRetryPolicy(agent, { maxRetries: -2 }).maxRetries).toBe(3)
    expect(summarizationRetryPolicy(agent, { maxRetries: Number.NaN }).maxRetries).toBe(3)
    expect(summarizationRetryPolicy(agent, { maxRetries: 1.7 }).maxRetries).toBe(1)
  })

  it('falls back to no retries when the agent level count is unusable', () => {
    const broken = { enabled: true, maxRetries: Number.NaN, baseDelayMs: 2000 }
    expect(summarizationRetryPolicy(broken).maxRetries).toBe(0)
    expect(summarizationRetryPolicy({ ...broken, maxRetries: -1 }).maxRetries).toBe(0)
  })

  it('carries the remaining policy fields through', () => {
    const policy = summarizationRetryPolicy({ enabled: false, maxRetries: 2, baseDelayMs: 500 }, { maxRetryDelayMs: 9000 })
    expect(policy.enabled).toBe(false)
    expect(policy.baseDelayMs).toBe(500)
    expect(policy.maxRetryDelayMs).toBe(9000)
  })
})

describe('retrySummarizationCall', () => {
  it('returns the first success without retrying', async () => {
    const { call, requests } = sequenceCall([ok('FIRST')])
    const wrapped = retrySummarizationCall(call, FAST)
    const response = await wrapped(REQUEST)
    expect(response.content).toEqual([{ type: 'text', text: 'FIRST' }])
    expect(requests).toHaveLength(1)
  })

  it('retries a transient failure and succeeds', async () => {
    const { call, requests } = sequenceCall([failure('fetch failed'), ok('SECOND')])
    const response = await retrySummarizationCall(call, FAST)(REQUEST)
    expect(response.stopReason).toBe('stop')
    expect(requests).toHaveLength(2)
  })

  it('does not retry a deterministic failure', async () => {
    const { call, requests } = sequenceCall([failure('insufficient_quota')])
    const response = await retrySummarizationCall(call, FAST)(REQUEST)
    expect(response.stopReason).toBe('error')
    expect(requests).toHaveLength(1)
  })

  it('returns the last failure once attempts are exhausted', async () => {
    const { call, requests } = sequenceCall([failure('fetch failed')])
    const response = await retrySummarizationCall(call, FAST)(REQUEST)
    expect(response.stopReason).toBe('error')
    expect(response.errorMessage).toBe('fetch failed')
    // One initial attempt plus two retries.
    expect(requests).toHaveLength(3)
  })

  it('makes exactly one call when the policy is disabled, absent, or zero', async () => {
    for (const policy of [undefined, { ...FAST, enabled: false }, { ...FAST, maxRetries: 0 }]) {
      const { call, requests } = sequenceCall([failure('fetch failed')])
      await retrySummarizationCall(call, policy)(REQUEST)
      expect(requests).toHaveLength(1)
    }
  })

  it('never loops forever when the retry count is unusable', async () => {
    // A non-finite count makes 'attempt >= maxAttempts' permanently false.
    // Sanitizing it to zero is what keeps this terminating.
    const { call, requests } = sequenceCall([failure('fetch failed')])
    const wrapped = retrySummarizationCall(call, {
      enabled: true,
      maxRetries: Number.NaN as unknown as number,
      baseDelayMs: 1,
    })

    const response = await wrapped(REQUEST)
    expect(response.stopReason).toBe('error')
    expect(requests).toHaveLength(1)
  })

  it('never retries an abort', async () => {
    const { call, requests } = sequenceCall([aborted()])
    const response = await retrySummarizationCall(call, FAST)(REQUEST)
    expect(response.stopReason).toBe('aborted')
    expect(requests).toHaveLength(1)
  })

  it('turns an abort during backoff into an aborted response', async () => {
    const controller = new AbortController()
    const { call, requests } = sequenceCall([failure('fetch failed'), ok()])
    const wrapped = retrySummarizationCall(call, { enabled: true, maxRetries: 3, baseDelayMs: 30_000 })

    controller.abort()
    const response = await wrapped({ ...REQUEST, signal: controller.signal })

    expect(response.stopReason).toBe('aborted')
    expect('errorMessage' in response).toBe(false)
    expect(requests).toHaveLength(1)
  })

  it('reports retry progress through the callbacks', async () => {
    const events: string[] = []
    const { call } = sequenceCall([failure('fetch failed'), ok()])
    const wrapped = retrySummarizationCall(call, FAST, {
      onRetryScheduled: (attempt, maxAttempts) => {
        events.push('scheduled:' + attempt + '/' + maxAttempts)
      },
      onRetryAttemptStart: () => {
        events.push('attempt-start')
      },
      onRetryFinished: (success, attempt) => {
        events.push('finished:' + success + ':' + attempt)
      },
    })

    await wrapped(REQUEST)
    expect(events).toEqual(['scheduled:1/2', 'attempt-start', 'finished:true:1'])
  })

  it('reports exhaustion through the callbacks', async () => {
    const events: string[] = []
    const { call } = sequenceCall([failure('fetch failed')])
    const wrapped = retrySummarizationCall(call, FAST, {
      onRetryFinished: (success, attempt, finalError) => {
        events.push('finished:' + success + ':' + attempt + ':' + finalError)
      },
    })

    await wrapped(REQUEST)
    expect(events).toEqual(['finished:false:2:fetch failed'])
  })

  it('passes the request through untouched', async () => {
    const { call, requests } = sequenceCall([ok()])
    const controller = new AbortController()
    const request: SummarizationRequest = { ...REQUEST, sessionId: 'route-1', signal: controller.signal }
    await retrySummarizationCall(call, FAST)(request)
    expect(requests[0]).toBe(request)
  })
})
