import React, { Profiler } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useConversations } from '../../../../frontend/chat/useConversations'
import { useContextUsage } from '../../../../frontend/chat/useContextUsage'
import { WorkingSection } from '../../../../frontend/working/WorkingSection'
import type { Message } from '../../../../frontend/chat/types'
import { fresh } from '../../fixtures'

const KEY = 'black_conversations_v1'
export async function mountStreamingFixture() {
  const previous = localStorage.getItem(KEY)
  const originalSet = Storage.prototype.setItem
  let saves = 0
  let commits = 0
  let unmounted = false
  let state: ReturnType<typeof useConversations>
  localStorage.setItem(KEY, JSON.stringify({ other: [{ id: 'old', role: 'user', content: 'x'.repeat(2 * 1024 * 1024), timestamp: 'now' }] }))
  Storage.prototype.setItem = function(key, value) {
    if (key === KEY) saves++
    return originalSet.call(this, key, value)
  }
  function Fixture() {
    state = useConversations()
    const messages = state.getMessages('streaming-test')
    useContextUsage('fixture', 'fixture', messages)
    return <>{messages.map(message => <WorkingSection key={message.id} message={message} active={message.work?.status === 'active'}
      onExpandedChange={(expanded, blockKey) => state.updateMessage('streaming-test', message.id, previous => ({
        ...previous, work: { ...previous.work!, ...(blockKey === undefined ? { expanded }
          : { expandedBlocks: { ...previous.work?.expandedBlocks, [blockKey]: expanded } }) },
      }))} />)}</>
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const unmount = () => {
    if (unmounted) return
    unmounted = true
    flushSync(() => root.unmount())
    container.remove()
  }
  const cleanup = () => {
    try { unmount() } finally {
      Storage.prototype.setItem = originalSet
      if (previous === null) localStorage.removeItem(KEY)
      else originalSet.call(localStorage, KEY, previous)
    }
  }
  try {
    flushSync(() => root.render(<Profiler id="stream" onRender={() => commits++}><Fixture /></Profiler>))
    flushSync(() => state.appendMessage('streaming-test', fresh()))
    state!.flushConversations()
    saves = 0; commits = 0
    return {
      patch: (update: (message: Message) => Message) => state.updateMessage('streaming-test', 'turn', update),
      current: () => state.getMessages('streaming-test')[0]!,
      persisted: (): Message => JSON.parse(localStorage.getItem(KEY)!)["streaming-test"][0],
      flush: () => state.flushConversations(),
      metrics: () => ({ saves, commits }),
      unmount,
      cleanup,
    }
  } catch (error) { cleanup(); throw error }
}
