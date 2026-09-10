import { describe, expect, it } from 'bun:test'

import { historyBefore } from '../frontend/chat/history'
import type { Message } from '../frontend/chat/types'

function message(id: string, role: 'user' | 'assistant', content: string): Message {
  return { id, role, content, timestamp: '00:00' }
}

const transcript: Message[] = [
  message('m1', 'user', 'first'),
  message('m2', 'assistant', 'answer'),
  message('m3', 'user', 'second'),
]

describe('historyBefore', () => {
  it('excludes the message itself, which is the one being sent', () => {
    // The queued turn's own text would otherwise appear twice: once at the end
    // of the history and once as the question.
    expect(historyBefore(transcript, 'm3').map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('returns everything ahead of the first message', () => {
    expect(historyBefore(transcript, 'm1')).toEqual([])
  })

  it('returns the whole transcript for an unknown id', () => {
    // Better an extra turn than an empty history if the transcript changed.
    expect(historyBefore(transcript, 'gone')).toEqual(transcript)
  })

  it('returns a copy for an unknown id, so a caller cannot mutate the transcript', () => {
    const result = historyBefore(transcript, 'gone')
    expect(result).not.toBe(transcript)
  })

  it('handles an empty transcript', () => {
    expect(historyBefore([], 'anything')).toEqual([])
  })
})
