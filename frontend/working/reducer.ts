import type { ChatStreamEvent } from '../../contracts/chat'
import type { Message } from '../chat/types'
import { finishToolRun, startToolRun } from '../chat/toolRun'
import { splitWork, startWork, type TurnWork, type WorkPart, type WorkStatus } from './model'

function closeThinking(parts: WorkPart[], now: number): WorkPart[] {
  return parts.map(p => p.type === 'thinking' && p.durationMs === undefined
    ? { ...p, durationMs: Math.max(0, now - p.startedAt) } : p)
}

export function finishWork(message: Message, status: WorkStatus, now: number, error?: string): Message {
  const work = message.work
  if (work === undefined || work.status !== 'active') return message
  const parts = closeThinking(work.parts, now).map(p => p.type !== 'tools' ? p : {
    ...p, runs: p.runs.map(run => run.result !== undefined ? run : { ...run, interrupted: true })
  })
  const next: TurnWork = { ...work, parts, status, updatedAt: now,
    elapsedMs: Math.max(0, now - work.startedAt), ...(error === undefined ? {} : { error }) }
  return { ...message, work: next, content: splitWork(next).answer }
}

/** Apply in transport order; a tool announcement classifies that request's text as activity. */
export function applyWorkEvent(message: Message, event: ChatStreamEvent, now: number): Message {
  const work = message.work ?? startWork(now)
  if (work.status !== 'active') return message
  if (event.type === 'error') return finishWork({ ...message, work }, 'failed', now, event.message ?? 'The stream failed.')
  if (event.type === 'done') {
    const status = event.stopReason === 'aborted' ? 'stopped' : event.stopReason === 'error' ? 'failed'
      : event.stopReason === 'length' ? 'incomplete' : 'completed'
    return finishWork({ ...message, work }, status, now, status === 'failed' ? 'The stream failed.' : undefined)
  }
  if (event.type === 'compacted') return { ...message, compacted: {
    before: event.tokensBefore ?? 0, ...(event.tokensAfter === undefined ? {} : { after: event.tokensAfter }),
    ...(event.summary === undefined ? {} : { summary: event.summary }),
    ...(event.firstKeptMessageId === undefined ? {} : { firstKeptMessageId: event.firstKeptMessageId })
  }, work: { ...work, updatedAt: now } }

  // Old live servers do not supply rounds. Do not infer them from accumulated fields.
  // New servers always attach a round to activity events.
  const round = event.round ?? 0
  let parts = [...work.parts]
  const last = parts.at(-1)
  if (event.type === 'text' || event.type === 'thinking') {
    const text = event.text ?? ''
    if (text === '' && event.thinkingSignature === undefined) return message
    if (last?.type === event.type && last.round === round) {
      parts[parts.length - 1] = { ...last, text: last.text + text,
        ...(last.type === 'thinking' && event.thinkingSignature !== undefined ? { signature: event.thinkingSignature } : {}) }
    } else {
      parts = closeThinking(parts, now)
      parts.push(event.type === 'text' ? { type: 'text', round, text } : {
        type: 'thinking', round, text, startedAt: now,
        ...(event.thinkingSignature === undefined ? {} : { signature: event.thinkingSignature })
      })
    }
  } else if (event.type === 'tool_calls') {
    const calls = event.toolCalls ?? []
    if (calls.length === 0) return message
    parts = closeThinking(parts, now)
    parts.push({ type: 'tools', round, runs: calls.map(startToolRun) })
  } else if (event.type === 'tool_result') {
    let found = false
    parts = parts.map(p => {
      if (p.type !== 'tools' || p.round !== round) return p
      return { ...p, runs: p.runs.map(run => {
        if (run.id !== event.toolCallId) return run
        found = true
        return finishToolRun(run, event.toolResult ?? '', event.toolIsError === true, event.toolDetails, event.toolImages)
      }) }
    })
    if (!found) return finishWork({ ...message, work }, 'failed', now, 'Received a tool result without its call.')
  }
  const next = { ...work, parts, updatedAt: now }
  return { ...message, work: next, content: splitWork(next).answer }
}
