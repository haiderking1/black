import type { Message } from '../types'
import { saveConversations } from './storage'

type Conversations = Record<string, Message[]>
export type ScheduleSave = (save: () => void, delayMs: number) => () => void
export const CONVERSATION_SAVE_INTERVAL_MS = 1000
const later: ScheduleSave = (save, delayMs) => {
  const timer = setTimeout(save, delayMs)
  return () => clearTimeout(timer)
}

/** Save the latest state periodically, never serialize a snapshot for each chunk. */
export function createConversationPersistence(
  read: () => Conversations,
  write: (conversations: Conversations) => void = saveConversations,
  schedule: ScheduleSave = later
) {
  let cancel: (() => void) | undefined
  function flush() {
    if (cancel === undefined) return
    const stop = cancel
    cancel = undefined
    stop()
    write(read())
  }
  return {
    schedule() { cancel ??= schedule(flush, CONVERSATION_SAVE_INTERVAL_MS) },
    flush,
  }
}
