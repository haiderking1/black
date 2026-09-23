import type { ChatRequest, ChatResult, ChatStopReason, FetchLike } from '../types'
import { createExperientialResponsesClient } from './responses'

export interface ExperientialChatClientOptions {
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}

function stopReason(reason: ChatStopReason | undefined): ChatStopReason {
  if (reason === 'length' || reason === 'aborted' || reason === 'error') return reason
  return 'stop'
}

/** Chat Completes through the same streamed Responses transport as interactive turns. */
export function createExperientialChatClient(options: ExperientialChatClientOptions) {
  const streaming = createExperientialResponsesClient(options)
  return {
    async chat(request: ChatRequest): Promise<ChatResult> {
      let text = ''
      let thinking = ''
      let thinkingSignature: string | undefined
      let usage = { input: 0, output: 0, total: 0 }
      let reason: ChatStopReason = 'stop'
      let errorMessage: string | undefined
      for await (const event of streaming.stream(request)) {
        if (event.type === 'text') text += event.text ?? ''
        if (event.type === 'thinking') {
          thinking += event.text ?? ''
          if (event.thinkingSignature !== undefined) thinkingSignature = event.thinkingSignature
        }
        if (event.type === 'done') {
          reason = stopReason(event.stopReason)
          if (event.usage !== undefined) usage = event.usage
        }
        if (event.type === 'error') {
          reason = 'error'
          errorMessage = event.message ?? 'Experiential request failed.'
        }
      }
      return {
        text, thinking, usage, stopReason: reason,
        ...(thinkingSignature === undefined ? {} : { thinkingSignature }),
        ...(errorMessage === undefined ? {} : { errorMessage }),
      }
    },
  }
}
