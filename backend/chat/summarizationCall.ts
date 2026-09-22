import type { SummarizationCall } from '../compaction'
import type { ChatRoute, ChatStopReason, Provider } from '../providers/types'

function asStopReason(reason: ChatStopReason): 'stop' | 'length' | 'error' | 'aborted' {
  if (reason === 'length' || reason === 'aborted' || reason === 'error') return reason
  return 'stop'
}

/** Adapt provider chat results without discarding compaction failure details. */
export function createSummarizationCall(
  provider: Pick<Provider, 'chat'>,
  providerId: string,
  model: string,
  signal: AbortSignal | undefined,
  route?: ChatRoute
): SummarizationCall {
  return async (request) => {
    const result = await provider.chat({
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.text }
      ],
      maxTokens: request.maxTokens,
      ...(request.sessionId !== undefined ? { sessionId: request.sessionId } : {}),
      ...(signal !== undefined ? { signal } : {}),
      ...(route !== undefined ? { route } : {})
    })

    return {
      role: 'assistant',
      content: [{ type: 'text', text: result.text }],
      api: 'chat',
      provider: providerId,
      model,
      usage: {
        input: Math.floor(result.usage.input),
        output: Math.floor(result.usage.output),
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: Math.floor(result.usage.total),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      },
      stopReason: asStopReason(result.stopReason),
      ...(result.errorMessage !== undefined ? { errorMessage: result.errorMessage } : {}),
      timestamp: Date.now()
    }
  }
}
