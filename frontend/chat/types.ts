import type { ImageAttachment } from '../../contracts/chat'
import type { ToolRun } from './toolRun'

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
  /**
   * Present when this turn folded older turns into a checkpoint.
   *
   * Stored rather than transient so the explanation is still there when the
   * reader scrolls back to the point where the model stopped remembering.
   */
  compacted?: { before: number; after?: number }
  /**
   * Tools the model asked for during this turn, in the order it asked.
   *
   * Stored on the message rather than held separately, because they are part of
   * what happened: a reply that read three files and edited one means something
   * different from a reply that only talked.
   */
  tools?: ToolRun[]
  /** Images sent with this turn, on a user message. */
  images?: ImageAttachment[]
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
