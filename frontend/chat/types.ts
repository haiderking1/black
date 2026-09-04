export type MessageRole = 'user' | 'assistant'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: string
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
