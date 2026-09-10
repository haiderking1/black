import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { decideFollow, isAtBottom as measureAtBottom } from './scrollGeometry'
import { isInspectingWork } from '../working/inspection'

export interface UseStickToBottomResult {
  /** The scrollable element. */
  scrollRef: RefObject<HTMLElement | null>
  /** Attach to the element whose height changes as content arrives. */
  contentRef: (node: HTMLDivElement | null) => void
  /** Attach to the scrollable element's onScroll. */
  handleScroll: () => void
  /** True while the view is following new content. */
  isPinned: boolean
  /** Actual proximity to the bottom, independent of paused following. */
  isAtBottom: boolean
  /** Return to the bottom and resume following. */
  jumpToBottom: (behavior?: ScrollBehavior) => void
}

/**
 * Keeps a transcript scrolled to its newest content, without trapping the reader.
 *
 * Three behaviours, which pull against each other:
 *
 * 1. Opening a conversation shows its end, not its beginning.
 * 2. While a reply streams in, the view follows it down.
 * 3. Scrolling up releases that hold, and it stays released until the reader
 *    comes back to the bottom by their own action.
 *
 * (3) is the one that matters. Following unconditionally makes history
 * unreadable, because every new token drags the view back down. Release is
 * decided by position alone — at the bottom means following, away from it means
 * not — so no attempt is made to tell a programmatic scroll from a user one. A
 * scroll this hook performs lands at the bottom, which reads as "still
 * following", so the distinction never has to be made.
 */
export function useStickToBottom(resetKey: string | undefined): UseStickToBottomResult {
  const scrollRef = useRef<HTMLElement | null>(null)

  // A callback ref rather than a RefObject: the observed element is not mounted
  // on first render when the conversation is empty, and it is replaced when the
  // first message arrives. Holding the node in state re-runs the effect below
  // whenever that element is swapped, which a RefObject would not notice.
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null)
  const contentRef = useCallback((node: HTMLDivElement | null): void => {
    setContentElement(node)
  }, [])

  // Mirrors isPinned so the ResizeObserver reads the current value without
  // resubscribing on every change. A scroll landing mid-stream would otherwise
  // observe a stale pin and fight the reader.
  const pinnedRef = useRef(true)
  const [isPinned, setIsPinned] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const updateBottomPosition = useCallback((): void => {
    const element = scrollRef.current
    setIsAtBottom(element === null || measureAtBottom(element))
  }, [])

  // The last scrollTop any scroll event reported. Comparing against it is what
  // separates a reader scrolling up from content growing underneath them.
  const lastScrollTopRef = useRef(0)

  const scrollToBottom = useCallback((behavior: ScrollBehavior): void => {
    const element = scrollRef.current
    if (element === null) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  const pin = useCallback((next: boolean): void => {
    if (pinnedRef.current === next) return
    pinnedRef.current = next
    setIsPinned(next)
  }, [])

  const jumpToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth'): void => {
      pin(true)
      scrollToBottom(behavior)
    },
    [pin, scrollToBottom]
  )

  const handleScroll = useCallback((): void => {
    const element = scrollRef.current
    if (element === null) return

    const previousTop = lastScrollTopRef.current
    lastScrollTopRef.current = element.scrollTop

    updateBottomPosition()
    const decision = decideFollow(element, previousTop)
    if (decision === 'follow') pin(true)
    else if (decision === 'release') pin(false)
    // 'hold' leaves the current state alone: the geometry moved, but the reader
    // did not.
  }, [pin, updateBottomPosition])

  // (1) A different conversation starts at its end. Instant rather than smooth:
  // animating down from the top of a long history is a slideshow.
  useEffect(() => {
    pin(true)
    scrollToBottom('auto')
    // Rebased for the new conversation, so its first scroll event is not
    // compared against the previous conversation's position.
    lastScrollTopRef.current = scrollRef.current?.scrollTop ?? 0
    updateBottomPosition()
  }, [resetKey, pin, scrollToBottom, updateBottomPosition])

  // (2) Stay at the bottom while content grows.
  //
  // Driven by a ResizeObserver rather than the caller's state, because content
  // also grows for reasons the caller cannot see: text reflowing as markdown
  // settles, a fenced block widening, a scrollbar appearing.
  useEffect(() => {
    if (contentElement === null) return

    const observer = new ResizeObserver(() => {
      // (3) Released: leave the reader where they are, even as content grows
      // beneath them.
      const element = scrollRef.current
      if (element === null) return
      if (pinnedRef.current && !isInspectingWork(contentElement)) {
        element.scrollTop = element.scrollHeight
      }
      updateBottomPosition()
    })

    const inspect = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest('[data-working]')) pin(false)
    }
    contentElement.addEventListener('pointerdown', inspect)
    contentElement.addEventListener('focusin', inspect)
    observer.observe(contentElement)
    if (scrollRef.current) observer.observe(scrollRef.current)
    return () => {
      observer.disconnect()
      contentElement.removeEventListener('pointerdown', inspect)
      contentElement.removeEventListener('focusin', inspect)
    }
  }, [contentElement, pin, updateBottomPosition])

  return { scrollRef, contentRef, handleScroll, isPinned, isAtBottom, jumpToBottom }
}
