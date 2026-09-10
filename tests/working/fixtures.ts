import type { ChatStreamEvent } from '../../contracts/chat'
import type { Message } from '../../frontend/chat/types'
import { startWork } from '../../frontend/working/model'
import { applyWorkEvent } from '../../frontend/working/reducer'

export const fresh = (): Message => ({ id: 'turn', role: 'assistant', content: '', timestamp: '12:00', work: startWork(1000) })
export const call = (id = 'read') => ({ id, name: 'read', arguments: '{"path":"file.ts"}' })
export function replay(events: readonly ChatStreamEvent[]): Message {
  return events.reduce((m, event, index) => applyWorkEvent(m, event, 1100 + index * 100), fresh())
}
export const rounds: ChatStreamEvent[] = [
  { type: 'text', round: 0, text: 'First progress.' },
  { type: 'thinking', round: 0, text: 'First reasoning.' },
  { type: 'text', round: 0, text: 'Before read.' },
  { type: 'tool_calls', round: 0, toolCalls: [call()] },
  { type: 'tool_result', round: 0, toolCallId: 'read', toolResult: 'read result' },
  { type: 'thinking', round: 1, text: 'Second reasoning.' },
  { type: 'text', round: 1, text: 'Second progress.' },
  { type: 'tool_calls', round: 1, toolCalls: [call('edit')] },
  { type: 'tool_result', round: 1, toolCallId: 'edit', toolResult: 'edit result' },
  { type: 'thinking', round: 2, text: 'Last reasoning.' },
  { type: 'text', round: 2, text: 'Final ' },
  { type: 'text', round: 2, text: 'answer.' },
  { type: 'done', stopReason: 'stop' }
]
