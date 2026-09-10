import { expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkingSection } from '../../frontend/working/WorkingSection'
import { PreviewProvider } from '../../frontend/lightbox/PreviewContext'
import { replay, rounds, fresh } from './fixtures'
import type { Message } from '../../frontend/chat/types'

function render(message: Message) {
  return renderToStaticMarkup(<PreviewProvider><WorkingSection message={message} active={message.work?.status === 'active'} onExpandedChange={() => {}} /></PreviewProvider>)
}

it('renders one main work group and keeps spoken messages outside', () => {
  const message = replay(rounds)
  message.work!.expanded = true
  const html = render(message)
  expect(html.match(/class="working-header"/g)).toHaveLength(1)
  expect(html).toContain('Worked for 1s')
  expect(html).toContain('aria-expanded="true" aria-controls=')
  expect(html.indexOf('First progress.')).toBeLessThan(html.indexOf('Before read.'))
  expect(html.indexOf('Before read.')).toBeLessThan(html.indexOf('Second progress.'))
  expect(html.indexOf('Second progress.')).toBeGreaterThan(html.indexOf('tool-runs'))
  expect(html.indexOf('Final answer.')).toBeGreaterThan(html.indexOf('</section>'))
  expect(html.match(/Final answer./g)).toHaveLength(1)
})

it('does not add redundant work to an ordinary text-only reply', () => {
  const html = render(replay([{ type: 'text', round: 0, text: 'Hello' }, { type: 'done', stopReason: 'stop' }]))
  expect(html).not.toContain('working-header')
  expect(html).toContain('Hello')
})

it('shows Working only for live activity, not completed or cancelled turns', () => {
  expect(render(replay(rounds.slice(0, 4)))).toContain('Working for ')
  expect(render(replay([...rounds.slice(0, 4), { type: 'done', stopReason: 'aborted' }]))).not.toContain('Working for ')
  expect(render(replay([...rounds.slice(0, 4), { type: 'done', stopReason: 'aborted' }]))).toContain('Stopped')
})

it('keeps tool errors inside the work group while retaining provider errors and spoken text', () => {
  const message = replay([
    ...rounds.slice(0, 4),
    { type: 'tool_result', round: 0, toolCallId: 'read', toolResult: 'Unique tool failure', toolIsError: true },
    { type: 'text', round: 1, text: 'Partial answer' },
    { type: 'error', message: 'Unique provider failure' }
  ])
  for (const expanded of [false, true]) {
    message.work!.expanded = expanded
    const html = render(message)
    expect(html.match(/Unique tool failure/g) ?? []).toHaveLength(expanded ? 1 : 0)
    expect(html.match(/Unique provider failure/g)).toHaveLength(1)
    expect(html).toContain('Partial answer')
    expect(html).not.toContain('Tool failed')
    expect(html).not.toContain('Working for ')
  }
})

it('keeps image previews and compaction notices', () => {
  const m = replay([{ type: 'compacted', tokensBefore: 1000, tokensAfter: 500 }, ...rounds.slice(0, 4),
    { type: 'tool_result', round: 0, toolCallId: 'read', toolResult: 'Image', toolImages: [{ mimeType: 'image/png', data: 'AAAA' }] },
    { type: 'done', stopReason: 'stop' }])
  m.work!.expanded = true
  const html = render(m)
  expect(html).toContain('data:image/png;base64,AAAA')
  expect(html).toContain('compaction')
})

it('renders legacy reasoning and tools without inventing an elapsed time', () => {
  const html = render({ ...fresh(), work: undefined, content: 'Legacy answer', thinking: 'Legacy thinking', tools: [{ id: 'old', name: 'read', args: '{}', result: 'result' }] })
  expect(html).toContain('Work history')
  expect(html).not.toContain('Worked for')
  expect(html).toContain('Legacy answer')
})

it('keeps every spoken message outside collapsed work blocks', () => {
  const html = render(replay(rounds))
  for (const text of ['First progress.', 'Before read.', 'Second progress.', 'Final answer.']) {
    expect(html).toContain(text)
    expect(html.match(/<section[\s\S]*?<\/section>/g)?.some(section => section.includes(text))).toBe(false)
  }
  expect(html).not.toContain('First reasoning.')
})

it('does not swallow a streamed message when its tool call arrives', () => {
  for (const count of [1, 4, rounds.length]) {
    const html = render(replay(rounds.slice(0, count)))
    expect(html).toContain('First progress.')
    expect(html.indexOf('First progress.')).toBeLessThan(html.indexOf('working-section') < 0 ? html.length : html.indexOf('working-section'))
  }
})

it('restores the main group expansion choice from previously saved blocks', () => {
  const message = replay(rounds)
  message.work!.expandedBlocks = { 'work:1': true, 'work:3': false }
  const html = render(message)
  expect(html.match(/class="working-header" aria-expanded="true"/g)).toHaveLength(1)
  expect(html).not.toContain('Second reasoning.')
  expect(html).toContain('Before read.')
})

it('keeps failed attempts and a successful retry in one running group', () => {
  const message = replay([
    ...rounds.slice(0, 4),
    { type: 'tool_result', round: 0, toolCallId: 'read', toolResult: 'Attempt failed', toolIsError: true },
    { type: 'text', round: 1, text: 'Retrying now.' },
    { type: 'tool_calls', round: 1, toolCalls: [{ id: 'retry', name: 'compute', arguments: '{"title":"Retry"}' }] },
    { type: 'tool_result', round: 1, toolCallId: 'retry', toolResult: 'Success', toolIsError: false }
  ])
  const collapsed = render(message)
  expect(collapsed.match(/class="working-header"/g)).toHaveLength(1)
  expect(collapsed).toContain('Working for ')
  expect(collapsed).toContain('Retrying now.')
  expect(collapsed).not.toContain('Attempt failed')
  message.work!.expanded = true
  const expanded = render(message)
  const section = expanded.match(/<section[\s\S]*?<\/section>/)?.[0] ?? ''
  expect(section).toContain('Attempt failed')
  expect(section).toContain('Retry')
  expect(section).not.toContain('Retrying now.')
  expect(expanded.match(/class="working-header"/g)).toHaveLength(1)
})
