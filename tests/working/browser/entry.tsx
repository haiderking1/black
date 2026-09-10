import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { WorkingSection } from '../../../frontend/working/WorkingSection'
import { PreviewProvider } from '../../../frontend/lightbox/PreviewContext'
import { useStickToBottom } from '../../../frontend/chat/useStickToBottom'
import { applyWorkEvent } from '../../../frontend/working/reducer'
import { hydrateMessage } from '../../../frontend/working/hydrate'
import { replay, rounds } from '../fixtures'
import type { Message } from '../../../frontend/chat/types'
import type { ChatStreamEvent } from '../../../contracts/chat'
import '../../../frontend/index.css'
import '../../../frontend/shimmer.css'
import { runScenarios } from './scenarios'

export interface BrowserHarness {
  patch(event: ChatStreamEvent): void
  replace(message: Message): void
  current(): Message
  remount(): void
  jump(): void
  scenarios(): Promise<string[]>
}
declare global { interface Window { workingHarness: BrowserHarness } }

function Fixture() {
  const [message, setMessage] = useState(() => replay(rounds.slice(0, 11)))
  const [key, setKey] = useState(0)
  const { scrollRef, contentRef, handleScroll, jumpToBottom, isPinned } = useStickToBottom('fixture')
  window.workingHarness = {
    patch: event => flushSync(() => setMessage(m => applyWorkEvent(m, event, 2500))),
    replace: m => flushSync(() => setMessage(m)),
    current: () => message,
    remount: () => flushSync(() => { setMessage(m => hydrateMessage(JSON.parse(JSON.stringify(m)))); setKey(k => k + 1) }),
    jump: () => jumpToBottom('auto'),
    scenarios: runScenarios
  }
  return <PreviewProvider>
    <main id="scroll" ref={scrollRef} onScroll={handleScroll} style={{ height: 480, overflowY: 'auto', width: 'min(800px, 100%)', margin: '0 auto', padding: 16 }}>
      <div ref={contentRef}>
        <div style={{ height: 900 }}>Earlier conversation</div>
        <WorkingSection key={key} message={message} active={message.work?.status === 'active'} onExpandedChange={(expanded, blockKey) => setMessage(m => ({ ...m, work: { ...m.work!, expandedBlocks: { ...m.work?.expandedBlocks, [blockKey!]: expanded } } }))} />
        <div id="next-prompt" />
      </div>
    </main>
    <output id="pinned">{String(isPinned)}</output>
  </PreviewProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
