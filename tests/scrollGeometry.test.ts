import { describe, expect, it } from 'bun:test'

import {
  STICK_THRESHOLD_PX,
  decideFollow,
  distanceFromBottom,
  isAtBottom,
} from '../frontend/chat/scrollGeometry'

describe('distanceFromBottom', () => {
  it('is zero when scrolled all the way down', () => {
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 800, clientHeight: 200 })).toBe(0)
  })

  it('measures the gap when scrolled up', () => {
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 300, clientHeight: 200 })).toBe(500)
  })

  it('never goes negative, which rounding can otherwise cause', () => {
    // Browsers report fractional scrollTop, so the sum can overshoot.
    expect(distanceFromBottom({ scrollHeight: 1000, scrollTop: 800.5, clientHeight: 200 })).toBe(0)
  })
})

describe('isAtBottom', () => {
  it('is true when the content is shorter than the viewport', () => {
    expect(isAtBottom({ scrollHeight: 100, scrollTop: 0, clientHeight: 400 })).toBe(true)
  })

  it('is true within the threshold, so a wheel gesture landing short still follows', () => {
    const gap = STICK_THRESHOLD_PX - 1
    expect(isAtBottom({ scrollHeight: 1000, scrollTop: 800 - gap, clientHeight: 200 })).toBe(true)
  })

  it('is false once the user has scrolled meaningfully away', () => {
    expect(isAtBottom({ scrollHeight: 1000, scrollTop: 800 - STICK_THRESHOLD_PX - 1, clientHeight: 200 })).toBe(false)
  })

  it('treats scrolling up as leaving, which is what releases the follow', () => {
    expect(isAtBottom({ scrollHeight: 5000, scrollTop: 0, clientHeight: 800 })).toBe(false)
  })
})

describe('decideFollow', () => {
  it('follows while the view is at the bottom', () => {
    expect(decideFollow({ scrollHeight: 1000, scrollTop: 800, clientHeight: 200 }, 800)).toBe('follow')
  })

  it('releases when the reader moves the viewport up', () => {
    expect(decideFollow({ scrollHeight: 5000, scrollTop: 1200, clientHeight: 800 }, 1500)).toBe('release')
  })

  it('holds when the viewport moved down but is not at the bottom yet', () => {
    expect(decideFollow({ scrollHeight: 5000, scrollTop: 1800, clientHeight: 800 }, 1500)).toBe('hold')
  })

  // The bug: the view is dragged to the bottom, more of the reply lands before
  // the scroll event is handled, and the stale event sees a viewport far from
  // the bottom. Reading that as the reader leaving stopped the drag mid-reply.
  it('holds when content grew beneath a viewport that never moved', () => {
    const before = { scrollHeight: 2000, scrollTop: 1200, clientHeight: 800 }
    const afterGrowth = { scrollHeight: 2600, scrollTop: 1200, clientHeight: 800 }

    // Sanity: by position alone this looks exactly like leaving.
    expect(isAtBottom(afterGrowth)).toBe(false)
    expect(distanceFromBottom(afterGrowth)).toBeGreaterThan(STICK_THRESHOLD_PX)

    // But scrollTop did not move, so the reader did not scroll.
    expect(decideFollow(afterGrowth, before.scrollTop)).toBe('hold')
  })

  it('never reads as the reader leaving when scrollTop only moved up', () => {
    // A drag to the bottom only ever increases scrollTop, so however far it
    // jumps it cannot be mistaken for the reader scrolling away. Mid-jump it
    // reports 'hold'; landing on the bottom reports 'follow'.
    expect(decideFollow({ scrollHeight: 9000, scrollTop: 8000, clientHeight: 800 }, 100)).toBe('hold')
    expect(decideFollow({ scrollHeight: 9000, scrollTop: 8200, clientHeight: 800 }, 8000)).toBe('follow')
  })

  it('always follows when there is nothing to scroll', () => {
    expect(decideFollow({ scrollHeight: 100, scrollTop: 0, clientHeight: 400 }, 0)).toBe('follow')
  })
})
