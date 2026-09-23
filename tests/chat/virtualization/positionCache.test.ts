import { describe, expect, it } from 'bun:test'

import {
  forgetTranscriptPosition,
  readTranscriptPosition,
  rememberTranscriptPosition,
  rebaseTranscriptPosition,
  resolveTranscriptAnchorIndex,
  type TranscriptPosition
} from '../../../frontend/chat/virtual/positionCache'

function position(itemKey: string, itemIndex: number): TranscriptPosition {
  return { itemKey, itemIndex, offset: -12, scrollTop: 420, atBottom: false }
}

describe('transcript position cache', () => {
  it('remembers a copied anchor by session', () => {
    const sessionId = 'position-cache-copy'
    const saved = position('m42', 42)
    expect(rememberTranscriptPosition(sessionId, saved)).toBe(true)
    expect(readTranscriptPosition(sessionId)).not.toBe(saved)
    expect(readTranscriptPosition(sessionId)).toEqual(saved)
    forgetTranscriptPosition(sessionId)
  })

  it('resolves the same row after older messages are compacted away', () => {
    const saved = position('keep-me', 510)
    expect(resolveTranscriptAnchorIndex(['new-summary', 'keep-me', 'later'], saved)).toBe(1)
    expect(resolveTranscriptAnchorIndex(['new-summary', 'later'], saved)).toBe(1)
    expect(resolveTranscriptAnchorIndex([], saved)).toBeUndefined()
  })

  it('moves a deleted prefix anchor to the next retained message', () => {
    const saved = position('m250', 250)
    expect(rebaseTranscriptPosition(
      saved,
      ['summary', 'm249', 'm250', 'm251', 'm252'],
      ['new-summary', 'm251', 'm252']
    )).toEqual({ ...saved, itemKey: 'm251', itemIndex: 1, offset: 0 })
  })

  it('rejects malformed positions without replacing a valid one', () => {
    const sessionId = 'position-cache-invalid'
    const saved = position('m1', 1)
    expect(rememberTranscriptPosition(sessionId, saved)).toBe(true)
    expect(rememberTranscriptPosition(sessionId, { ...saved, offset: Number.NaN })).toBe(false)
    expect(readTranscriptPosition(sessionId)).toEqual(saved)
    forgetTranscriptPosition(sessionId)
  })

  it('bounds the cache and evicts the oldest remembered session', () => {
    const prefix = 'position-cache-limit-'
    for (let index = 0; index <= 100; index++) {
      rememberTranscriptPosition(prefix + index, position('m' + index, index))
    }
    expect(readTranscriptPosition(prefix + 0)).toBeUndefined()
    expect(readTranscriptPosition(prefix + 100)).toEqual(position('m100', 100))
    for (let index = 1; index <= 100; index++) forgetTranscriptPosition(prefix + index)
  })
})
