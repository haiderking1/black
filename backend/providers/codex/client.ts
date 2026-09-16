import type { ChatRequest, ChatResult, ChatStopReason, ChatStreamEvent, FetchLike } from '../types'
import { createStreamingClient } from './stream'

export interface ChatClientOptions {
  baseUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}

function asStopReason(reason: ChatStopReason | undefined): ChatStopReason {
  if (reason === 'length' || reason === 'aborted' || reason === 'error') return reason
  return 'stop'
}

export function createChatClient(options: ChatClientOptions) {
  const streaming = createStreamingClient(options)

  return {
    async chat(request: ChatRequest): Promise<ChatResult> {
      let text = ''
      let thinking = ''
      let thinkingSignature: string | undefined
      let stopReason: ChatStopReason = 'stop'
      let usage = { input: 0, output: 0, total: 0 }
      let errorMessage: string | undefined

      for await (const event of streaming.stream(request)) {
        if (event.type === 'text' && event.text !== undefined) text += event.text
        if (event.type === 'thinking') {
          if (event.text !== undefined) thinking += event.text
          if (event.thinkingSignature !== undefined) thinkingSignature = event.thinkingSignature
        }
        if (event.type === 'done') {
          stopReason = asStopReason(event.stopReason)
          if (event.usage !== undefined) usage = event.usage
        }
        if (event.type === 'error') {
          stopReason = 'error'
          errorMessage = event.message
        }
      }

      return {
        text,
        thinking,
        ...(thinkingSignature !== undefined ? { thinkingSignature } : {}),
        usage,
        stopReason,
        ...(errorMessage !== undefined ? { errorMessage } : {}),
      }
    },
  }
}

export type { ChatStreamEvent }
