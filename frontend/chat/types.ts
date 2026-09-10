export type MessageRole = 'user' | 'assistant'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: string
  /**
   * The model's reasoning, kept apart from the answer.
   *
   * Vendors send it on a separate channel from the reply text, and folding the
   * two together would put scratch work in the middle of the answer.
   */
  thinking?: string
  /** How long reasoning took, set once the answer starts or the turn ends. */
  thinkingMs?: number
}

let messageCounter = 0

export function createMessage(role: MessageRole, content: string): Message {
  messageCounter += 1
  return {
    id: `msg-${Date.now().toString(36)}-${messageCounter}`,
    role,
    content,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}
