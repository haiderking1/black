import { expect, it } from 'bun:test'
import { turnHistory, conversationHistory } from '../../frontend/working/history'
import { hydrateMessage, isTurnWork } from '../../frontend/working/hydrate'
import { saveConversations, loadConversations } from '../../frontend/chat/useConversations'
import { providerHistory, wireTranscript } from '../../backend/chat/history'
import { toEntries } from '../../backend/chat/transcript'
import { findCutPoint } from '../../backend/compaction/cut-point'
import { measureContext } from '../../backend/chat/fitContext'
import { serializeConversation } from '../../backend/compaction/serialization'
import { buildMessage } from '../../backend/providers/opencode/message'
import { fresh, replay, rounds } from './fixtures'

it('replays each provider round and its tools once, with stable ids', () => {
  const m = replay(rounds)
  const history = turnHistory(m)
  expect(history.map(p => p.role)).toEqual(['assistant', 'tool', 'assistant', 'tool', 'assistant'])
  expect(history.filter(p => p.role === 'assistant').map(p => p.content)).toEqual(['First progress.Before read.', 'Second progress.', 'Final answer.'])
  expect(history.filter(p => p.role === 'assistant').flatMap(p => p.toolCalls ?? []).map(c => c.id)).toEqual(['read', 'edit'])
  expect(new Set(history.map(p => p.id)).size).toBe(history.length)
  expect(turnHistory(hydrateMessage(JSON.parse(JSON.stringify(m))))).toEqual(history)
  const provider = providerHistory(wireTranscript(history))
  expect(provider[0]?.toolCalls).toEqual([...(history[0]?.toolCalls ?? [])])
  expect(buildMessage(provider[1]!)).toMatchObject({ role: 'tool', tool_call_id: 'read', content: 'read result' })
})

it('keeps images and signatures on their actual request without repeating activity', () => {
  const image = { mimeType: 'image/png', data: 'AAAA' }
  const m = replay([
    { type: 'thinking', round: 0, text: 'Thought', thinkingSignature: '[{"id":"sig"}]' },
    ...rounds.slice(2, 4),
    { type: 'tool_result', round: 0, toolCallId: 'read', toolResult: 'image read', toolImages: [image] },
    { type: 'text', round: 1, text: 'Seen' }, { type: 'done', stopReason: 'stop' }
  ])
  const history = turnHistory(m)
  expect(history.map(p => p.role)).toEqual(['assistant', 'tool', 'user', 'assistant'])
  expect(history[2]?.images).toEqual([image])
  expect(buildMessage(providerHistory(wireTranscript(history))[0]!)['reasoning_details']).toEqual([{ id: 'sig' }])
})

it('legacy saved messages keep their text once without claiming recovered rounds', () => {
  const m = { ...fresh(), work: undefined, content: 'Old merged text', thinking: 'Old reasoning', tools: [{ id: 'old', name: 'read', args: '{}', result: 'Old result' }] }
  const hydrated = hydrateMessage(JSON.parse(JSON.stringify(m)))
  expect(hydrated.work).toBeUndefined()
  expect(turnHistory(hydrated).map(p => p.content)).toEqual(['', 'Old result', 'Old merged text'])
  expect(turnHistory({ ...m, tools: undefined })).toEqual([{ id: 'turn', role: 'assistant', content: 'Old merged text' }])
})

it('freezes interrupted replay at the last recorded event, with saved disclosure choice', () => {
  const m = replay(rounds.slice(0, 4))
  m.work!.expanded = false
  const hydrated = hydrateMessage(JSON.parse(JSON.stringify(m)))
  expect(hydrated.work?.status).toBe('interrupted')
  expect(hydrated.work?.elapsedMs).toBe(400)
  expect(hydrated.work?.expanded).toBe(false)
  expect(hydrateMessage(hydrated)).toEqual(hydrated)
  expect(turnHistory(hydrated)[1]?.content).toContain('no result was recorded')
})

it('rejects malformed persisted parts instead of crashing tool or reasoning rendering', () => {
  for (const parts of [[null], [{ type: 'text', round: -1, text: 'x' }], [{ type: 'tools', round: 0, runs: [null] }], [{ type: 'thinking', round: 0, text: 4 }]]) {
    const m = { ...fresh(), work: { ...fresh().work!, parts } }
    expect(isTurnWork(m.work)).toBe(false)
    expect(hydrateMessage(m as ReturnType<typeof fresh>).work).toBeUndefined()
  }
})

it('persists completed elapsed time and explicit choices through actual conversation storage', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value)
  } })
  try {
    const m = replay(rounds)
    m.work!.expanded = true
    saveConversations({ session: [m] })
    expect(loadConversations().session).toEqual([m])
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})

it('compaction measures calls/results and never cuts within an expanded UI turn', () => {
  const m = replay(rounds)
  const history = wireTranscript([{ id: 'user', role: 'user', content: 'Question' }, ...turnHistory(m), { id: 'next', role: 'user', content: 'Next' }])
  const entries = toEntries(history)
  for (let budget = 1; budget < 100; budget++) {
    const cut = findCutPoint(entries, 0, entries.length, budget)
    expect(['user', 'turn', 'next']).toContain(entries[cut.firstKeptEntryIndex]!.id)
  }
  expect(measureContext(history)).toBeGreaterThan(measureContext([{ id: 'turn', role: 'assistant', content: m.content }]))
  const serialized = serializeConversation(entries.map(e => e.message).filter(m => m.role === 'assistant' || m.role === 'user' || m.role === 'toolResult'))
  expect(serialized).toContain('[Assistant tool calls]: read(path="file.ts")')
  expect(serialized).toContain('[Tool result]: read result')
})

it('automatic checkpoints govern later history once, while leaving visible work intact', () => {
  const old = { ...fresh(), id: 'old', work: undefined, content: 'Old history' }
  const kept = { ...fresh(), id: 'kept', work: undefined, content: 'Recent history' }
  const m = replay([{ type: 'compacted', tokensBefore: 100, tokensAfter: 50, summary: 'Summary', firstKeptMessageId: 'kept' }, ...rounds])
  const history = conversationHistory([old, kept, m])
  expect(history[0]).toMatchObject({ role: 'system', content: 'Summary' })
  expect(history.some(p => p.content === 'Old history')).toBe(false)
  expect(history.filter(p => p.content === 'Summary')).toHaveLength(1)
  expect(m.work?.parts).toHaveLength(9)
})
