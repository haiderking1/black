import type { ChatMessage } from '../../contracts/chat'
import type { Message } from '../chat/types'
import type { ToolRun } from '../chat/toolRun'
import type { WorkPart } from './model'

/** One UI turn becomes the exact assistant/tool request sequence, once. */
export function turnHistory(message: Message): ChatMessage[] {
  if (message.role === 'user') return [{ id: message.id, role: 'user', content: message.content,
    ...(message.images?.length ? { images: message.images } : {}) }]
  if (message.work === undefined) {
    // Legacy storage erased round boundaries. Preserve the saved text once;
    // do not pretend to recover which tool request originally accompanied it.
    if (!message.tools?.length) return [{ id: message.id, role: 'assistant', content: message.content }]
    return [...roundHistory(message.id, message.id, '', message.tools),
      { id: message.id + ':answer', turnId: message.id, role: 'assistant', content: message.content }]
  }
  const groups = new Map<number, WorkPart[]>()
  for (const part of message.work.parts) {
    const group = groups.get(part.round) ?? []
    group.push(part)
    groups.set(part.round, group)
  }
  const result: ChatMessage[] = []
  for (const [round, parts] of groups) {
    const content = parts.filter(p => p.type === 'text').map(p => p.text).join('')
    const runs = parts.flatMap(p => p.type === 'tools' ? p.runs : [])
    const signature = parts.filter(p => p.type === 'thinking').map(p => p.signature).filter(s => s !== undefined).at(-1)
    if (!content && !runs.length && signature === undefined) continue
    const id = result.length === 0 ? message.id : message.id + ':round:' + round
    result.push(...roundHistory(id, message.id, content, runs, signature))
  }
  return result
}

function roundHistory(id: string, turnId: string, content: string, runs: readonly ToolRun[], thinkingSignature?: string): ChatMessage[] {
  const result: ChatMessage[] = [{ id, turnId, role: 'assistant', content,
    ...(thinkingSignature === undefined ? {} : { thinkingSignature }),
    ...(runs.length === 0 ? {} : { toolCalls: runs.map(run => ({ id: run.id, name: run.name, arguments: run.args })) }) }]
  for (const [index, run] of runs.entries()) result.push({ id: id + ':tool:' + index, turnId, role: 'tool',
    toolCallId: run.id, content: run.result ?? 'Tool execution was interrupted; no result was recorded.' })
  const images = runs.flatMap(run => run.images ?? [])
  if (images.length) result.push({ id: id + ':images', turnId, role: 'user', content: '', images })
  return result
}

export function conversationHistory(messages: readonly Message[]): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const checkpoint = messages[i]?.compacted
    if (!checkpoint?.summary || !checkpoint.firstKeptMessageId) continue
    const cut = messages.findIndex(m => m.id === checkpoint.firstKeptMessageId)
    if (cut < 0 || cut > i) continue
    return [{ id: 'compaction-summary', role: 'system', content: checkpoint.summary },
      ...messages.slice(cut).flatMap(turnHistory)]
  }
  return messages.flatMap(turnHistory)
}
