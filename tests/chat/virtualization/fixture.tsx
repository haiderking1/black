import React from 'react'
import { createRoot } from 'react-dom/client'
import { VirtualTranscript } from '../../../frontend/chat/virtual/VirtualTranscript'
import { useStickToBottom } from '../../../frontend/chat/useStickToBottom'
import '../../../frontend/index.css'

interface TranscriptItem {
  id: string
  text: string
  height: number
}

const items: TranscriptItem[] = Array.from({ length: 5000 }, (_, index) => ({
  id: 'message-' + index,
  text: 'Message ' + index,
  height: 72 + (index % 5) * 28,
}))

interface VirtualTranscriptHarness {
  renderedIndexes(): number[]
  scrollToIndex(index: number): void
  totalCount(): number
  layout(): { display: string; paddingTop: string; paddingBottom: string }
}

declare global {
  interface Window {
    virtualTranscriptHarness: VirtualTranscriptHarness
  }
}

function Fixture(): React.JSX.Element {
  const { scrollRef, contentRef, handleScroll } = useStickToBottom('virtual-test')
  window.virtualTranscriptHarness = {
    renderedIndexes: () => [...document.querySelectorAll<HTMLElement>('[data-virtual-message]')]
      .map((element) => Number(element.dataset['virtualMessage'])),
    scrollToIndex: (index) => {
      const scrollElement = scrollRef.current
      if (scrollElement === null) return
      scrollElement.scrollTop = index * 150
      scrollElement.dispatchEvent(new Event('scroll'))
    },
    totalCount: () => items.length,
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

createRoot(document.getElementById('root')!).render(<Fixture />)
