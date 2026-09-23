import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { VirtualTranscript } from '../../../frontend/chat/virtual/VirtualTranscript'
import { useStickToBottom } from '../../../frontend/chat/useStickToBottom'
import '../../../frontend/index.css'

interface TranscriptItem {
  id: string
  text: string
  height: number
}

function makeItems(session: string, count: number): TranscriptItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: session + '-message-' + index,
    text: session + ' message ' + index,
    height: 72 + (index % 5) * 28,
  }))
}

const sessionItems = {
  first: makeItems('first', 5000),
  second: makeItems('second', 3000),
}

interface VirtualTranscriptHarness {
  renderedIndexes(): number[]
  scrollToIndex(index: number): void
  switchSession(session: 'first' | 'second'): void
  trimFirstPrefix(count: number): void
  totalCount(): number
  visibleAnchor(): { key: string; offset: number } | null
  replaceVisibleAnchor(): string | null
  layout(): { display: string; paddingTop: string; paddingBottom: string }
}

declare global {
  interface Window {
    virtualTranscriptHarness: VirtualTranscriptHarness
  }
}

function Fixture(): React.JSX.Element {
  const [session, setSession] = useState<'first' | 'second'>('first')
  const [firstPrefixLength, setFirstPrefixLength] = useState(0)
  const [replacement, setReplacement] = useState<{ session: 'first' | 'second'; oldId: string; item: TranscriptItem } | null>(null)
  const sourceItems = session === 'first'
    ? sessionItems.first.slice(firstPrefixLength)
    : sessionItems.second
  const items = replacement?.session === session
    ? sourceItems.map((item) => item.id === replacement.oldId ? replacement.item : item)
    : sourceItems
  const { scrollRef, contentRef, handleScroll } = useStickToBottom('virtual-' + session)
  window.virtualTranscriptHarness = {
    renderedIndexes: () => [...document.querySelectorAll<HTMLElement>('[data-virtual-message]')]
      .map((element) => Number(element.dataset['virtualMessage'])),
    scrollToIndex: (index) => {
      const scrollElement = scrollRef.current
      if (scrollElement === null) return
      scrollElement.scrollTop = index * 150
      scrollElement.dispatchEvent(new Event('scroll'))
    },
    switchSession: (next) => setSession(next),
    trimFirstPrefix: (count) => setFirstPrefixLength(Math.max(0, Math.min(sessionItems.first.length, Math.floor(count)))),
    totalCount: () => items.length,
    visibleAnchor: () => {
      const scrollElement = scrollRef.current
      if (scrollElement === null) return null
      const viewport = scrollElement.getBoundingClientRect()
      const viewportTop = viewport.top + scrollElement.clientTop
      const viewportBottom = viewportTop + scrollElement.clientHeight
      const rows = document.querySelectorAll<HTMLElement>('[data-transcript-item-key]')
      for (const row of rows) {
        const bounds = row.getBoundingClientRect()
        if (bounds.bottom <= viewportTop || bounds.top >= viewportBottom) continue
        const key = row.dataset['transcriptItemKey']
        if (key !== undefined) return { key, offset: bounds.top - viewportTop }
      }
      return null
    },
    replaceVisibleAnchor: () => {
      const anchor = window.virtualTranscriptHarness.visibleAnchor()
      if (anchor === null) return null
      const original = items.find((item) => item.id === anchor.key)
      if (original === undefined) return null
      const nextId = anchor.key + '-retry'
      setReplacement({
        session,
        oldId: anchor.key,
        item: { ...original, id: nextId, text: 'Replaced ' + original.text, height: original.height + 80 }
      })
      return nextId
    },
    layout: () => {
      const transcript = document.querySelector<HTMLElement>('.chat-transcript-virtual')!
      const style = getComputedStyle(transcript)
      return { display: style.display, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom }
    },
  }

  return (
    <main
      id="virtual-scroll"
      ref={scrollRef}
      onScroll={handleScroll}
      style={{ height: 480, width: 820, overflowY: 'auto', margin: '0 auto' }}
    >
      <VirtualTranscript
        items={items}
        scrollRef={scrollRef}
        contentRef={contentRef}
        positionKey={'virtual-' + session}
        itemKey={(item) => item.id}
        renderItem={(item, index) => (
          <article
            data-virtual-message={index}
            style={{ minHeight: item.height, borderBottom: '1px solid #333', padding: 12 }}
          >
            {item.text}
          </article>
        )}
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Fixture />
  </React.StrictMode>
)
