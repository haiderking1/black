import { describe, expect, test } from 'bun:test'

import type { ChatResult } from '../../backend/providers/types'
import { createSummarizationCall } from '../../backend/chat/summarizationCall'

const summaryRequest = {
  systemPrompt: 'system',
  text: 'summarize this',
  maxTokens: 128
}

function providerReturning(result: ChatResult) {
  return {
    chat: async () => result
  }
}

describe('createSummarizationCall', () => {
  test('preserves the provider error message for compaction failures', async () => {
    const result: ChatResult = {
      text: '',
      thinking: '',
      usage: { input: 5, output: 0, total: 5 },
      stopReason: 'error',
      errorMessage: 'request rejected: context limit exceeded'
    }

    const response = await createSummarizationCall(
      providerReturning(result),
      'test-provider',
      'test-model',
      undefined
    )(summaryRequest)

    expect(response.stopReason).toBe('error')
    expect(response.errorMessage).toBe('request rejected: context limit exceeded')
  })

  test('does not add an error message to successful responses', async () => {
    const result: ChatResult = {
      text: 'checkpoint',
      thinking: '',
      usage: { input: 5, output: 2, total: 7 },
      stopReason: 'stop'
    }

    const response = await createSummarizationCall(
      providerReturning(result),
      'test-provider',
      'test-model',
      undefined
    )(summaryRequest)

    expect(response.stopReason).toBe('stop')
    expect(response).not.toHaveProperty('errorMessage')
  })
})
