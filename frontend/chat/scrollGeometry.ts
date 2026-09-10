/**
 * How close to the bottom still counts as being at the bottom.
 *
 * Non-zero on purpose: sub-pixel layout, fractional line heights and a wheel
 * gesture that lands a few pixels short all leave a small gap. Treating those as
 * "scrolled away" would drop the view out of following for no visible reason.
 */
export const STICK_THRESHOLD_PX = 32

/**
 * The parts of an element this module needs.
 *
 * Declared structurally so the arithmetic can be tested without a DOM.
 */
export interface ScrollMetrics {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

/** Pixels between the current position and the bottom. Never negative. */
export function distanceFromBottom(metrics: ScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight)
}

/**
 * Whether the view is close enough to the bottom to keep following new content.
 *
 * A container with nothing to scroll counts as at the bottom, so a short
 * conversation stays pinned.
 */
export function isAtBottom(metrics: ScrollMetrics, threshold: number = STICK_THRESHOLD_PX): boolean {
  if (metrics.scrollHeight <= metrics.clientHeight) return true
  return distanceFromBottom(metrics) <= threshold
}

/** What a scroll event means for following new content. */
export type FollowDecision = 'follow' | 'release' | 'hold'

/**
 * Decides whether a scroll event should start or stop following.
 *
 * `'hold'` is the reason this is not just a position check, and it fixes a bug
 * that showed up as the view stopping partway down a streaming reply.
 *
 * Scroll events are dispatched asynchronously. Between performing a scroll to
 * the bottom and the resulting event arriving, more of the reply can land — so
 * by the time the handler runs, the view is no longer within the threshold of
 * the bottom even though the reader never moved. Judging that by position alone
 * reports "the reader scrolled away" and releases the follow, mid-reply, with
 * the view stranded above the newest text.
 *
 * The reader leaving is the viewport moving *up*. Content growing beneath a
 * stationary viewport produces the same position, and is told apart by scrollTop
 * having decreased rather than merely being far from the bottom.
 */
export function decideFollow(
  metrics: ScrollMetrics,
  previousScrollTop: number,
  threshold: number = STICK_THRESHOLD_PX
): FollowDecision {
  if (isAtBottom(metrics, threshold)) return 'follow'
  return metrics.scrollTop < previousScrollTop ? 'release' : 'hold'
}
