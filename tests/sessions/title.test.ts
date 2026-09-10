import { expect, test } from 'bun:test'
import { generateSessionTitle } from '../../backend/sessions/title/generate'
import type { ChatRequest, ChatResult } from '../../backend/providers/types'

const result = (text: string): ChatResult => ({ text, thinking: '', usage: { input: 0, output: 0, total: 0 }, stopReason: 'stop' })

test('uses selected model and lowest supported effort with a separate title request', async () => {
  let request: ChatRequest | undefined
  const title = await generateSessionTitle({
    thinkingFor: async () => ({ reasoning: true, kind: 'effort', levels: ['max', 'low', 'high'] }),
    chat: async value => { request = value; return result('{"title":"Fix timer position"}') },
  }, 'selected-model', 'fix my timer', 'session')
  expect(title.title).toBe('Fix timer position')
  expect(request?.model).toBe('selected-model')
  expect(request?.reasoningEffort).toBe('low')
  expect(request?.tools).toBeUndefined()
  expect(request?.messages[1]?.content).toBe('fix my timer')
})

test('rejects malformed output rather than naming a session with it', async () => {
  await expect(generateSessionTitle({
    thinkingFor: async () => ({ reasoning: false, kind: 'unknown', levels: [] }),
    chat: async () => result('Here is a title!'),
  }, 'model', 'message', 'session')).rejects.toThrow()
})
