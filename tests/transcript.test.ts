import { describe, expect, it } from 'bun:test'

import { messagesFrom, summaryBlock, toEntries } from '../backend/chat/transcript'
import type { TranscriptMessage } from '../backend/chat/transcript'

const transcript: TranscriptMessage[] = [
  { id: 'm1', role: 'user', content: 'first' },
  { id: 'm2', role: 'assistant', content: 'answer' },
  { id: 'm3', role: 'user', content: 'second' }
]

describe('toEntries', () => {
  it('keeps the ids the wire carried', () => {
    // A cut point names an entry id. Ids assigned here would differ every turn
    // for the same history, and the cut would never resolve.
    expect(toEntries(transcript).map((entry) => entry.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('chains parent ids in order, null first', () => {
    const entries = toEntries(transcript)
    expect(entries[0]?.parentId).toBeNull()
    expect(entries[1]?.parentId).toBe('m1')
    expect(entries[2]?.parentId).toBe('m2')
  })

  it('carries the text through', () => {
    const entries = toEntries(transcript)
    expect(entries[1]?.message.role).toBe('assistant')
    expect(JSON.stringify(entries[1]?.message)).toContain('answer')
  })

  it('handles an empty transcript', () => {
    expect(toEntries([])).toEqual([])
  })
})

describe('messagesFrom', () => {
  it('returns the kept entry and everything after it', () => {
    expect(messagesFrom(transcript, 'm3').map((m) => m.id)).toEqual(['m3'])
    expect(messagesFrom(transcript, 'm2').map((m) => m.id)).toEqual(['m2', 'm3'])
  })

  it('returns everything when the id is gone, rather than nothing', () => {
    // Too large is recoverable. An empty history is not.
    expect(messagesFrom(transcript, 'gone')).toEqual(transcript)
  })
})

describe('summaryBlock', () => {
  it('labels the summary so the model knows what it is reading', () => {
    expect(summaryBlock('did things')).toContain('did things')
    expect(summaryBlock('did things')).toContain('before the context was trimmed')
  })
})
