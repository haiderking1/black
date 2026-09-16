import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { scrollbarSize } from './scrollbar'
import './floating-composer.css'

/** Reserve only the space needed to scroll the last message above the composer. */
export function useFloatingComposer(scrollRef: RefObject<HTMLElement | null>, pinned: boolean) {
  const [frame, frameRef] = useState<HTMLDivElement | null>(null)
  const [footer, footerRef] = useState<HTMLDivElement | null>(null)
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned

  useLayoutEffect(() => {
    if (!frame || !footer) return
    const measure = () => {
      const height = footer.getBoundingClientRect().height
      frame.style.setProperty('--composer-inset', height + 'px')
      const scroll = scrollRef.current
      if (scroll === null) return
      frame.style.setProperty('--chat-scrollbar', scrollbarSize(scroll) + 'px')
      if (pinnedRef.current) scroll.scrollTop = scroll.scrollHeight
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(footer)
    const scroll = scrollRef.current
    if (scroll !== null) observer.observe(scroll)
    return () => observer.disconnect()
  }, [frame, footer, scrollRef])

  return { frameRef, footerRef }
}
