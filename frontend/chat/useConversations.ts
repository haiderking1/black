import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Message } from './types'
import { loadConversations } from './conversations/storage'
import { applyMessageUpdate, removeMessage, removeConversationsBySessionIds } from './conversations/state'
import { createFramePublisher } from './conversations/publication'
import { createConversationPersistence } from './conversations/persistence'
import { recordRecovery } from './conversations/recovery'

export { loadConversations, saveConversations } from './conversations/storage'
export { applyMessageUpdate, removeMessage, removeConversationsBySessionIds } from './conversations/state'

export interface UseConversationsResult {
  getMessages: (sessionId: string) => Message[]
  appendMessage: (sessionId: string, message: Message) => void
  /**
   * Rewrite one message. Used to grow a streaming reply in place, to append
   * reasoning beside it, and to retain partial output when a run is interrupted.
   */
  updateMessage: (sessionId: string, messageId: string, update: (previous: Message) => Message) => void
  /** Replace a whole conversation, used when a checkpoint is applied. */
  replaceMessages: (sessionId: string, messages: Message[]) => void
  /** Remove one message, used when a queued turn is taken back. */
  deleteMessage: (sessionId: string, messageId: string) => void
  deleteConversations: (sessionIds: string[]) => void
  /** Publish and save pending progress before completion or queue draining. */
  flushConversations: () => void
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<Record<string, Message[]>>(loadConversations)

  // Stream callbacks and queue draining can share one React batch. The next
  // request must see the last event now, not after the next render's effect.
  const current = useRef(conversations)
  const publication = useMemo(() => createFramePublisher(() => setConversations(current.current)), [])
  const persistence = useMemo(() => createConversationPersistence(() => current.current), [])
  const flushConversations = useCallback(() => {
    publication.flush()
    persistence.flush()
  }, [publication, persistence])

  const publish = useCallback((update: (previous: Record<string, Message[]>) => Record<string, Message[]>, deferred = false): void => {
    const next = update(current.current)
    if (next === current.current) return
    current.current = next
    persistence.schedule()
    if (deferred) publication.schedule()
    else {
      publication.cancel()
      setConversations(next)
    }
  }, [publication, persistence])

  useEffect(() => {
    const save = () => persistence.flush()
    const onVisibility = () => { if (document.visibilityState === 'hidden') save() }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibility)
      publication.cancel()
      persistence.flush()
    }
  }, [publication, persistence])

  const getMessages = useCallback(
    (sessionId: string): Message[] => current.current[sessionId] ?? [],
    []
  )

  const appendMessage = useCallback((sessionId: string, message: Message): void => {
    publish((prev) => {
      const existing = prev[sessionId] ?? []
      recordRecovery({ kind: 'message', sessionId, message, afterId: existing.at(-1)?.id ?? null })
      return { ...prev, [sessionId]: [...existing, message] }
    })
  }, [publish])

  const updateMessage = useCallback(
    (sessionId: string, messageId: string, update: (previous: Message) => Message): void => {
      let settled = false
      publish(prev => applyMessageUpdate(prev, sessionId, messageId, previous => {
        const next = update(previous)
        if (next !== previous) {
          const index = prev[sessionId]!.findIndex(message => message.id === messageId)
          recordRecovery({ kind: 'message', sessionId, message: next, afterId: prev[sessionId]![index - 1]?.id ?? null })
        }
        settled = previous.work?.status === 'active' && next.work?.status !== 'active'
        return next
      }), true)
      // Completion, Stop, failures and disconnects must not wait for a frame or
      // a save timer. Queued turns also read the final state synchronously.
      if (settled) flushConversations()
    },
    [publish, flushConversations]
  )

  const replaceMessages = useCallback((sessionId: string, messages: Message[]): void => {
    recordRecovery({ kind: 'session', sessionId, messages })
    publish((prev) => ({ ...prev, [sessionId]: messages }))
  }, [publish])

  const deleteMessage = useCallback((sessionId: string, messageId: string): void => {
    recordRecovery({ kind: 'remove', sessionId, messageId })
    publish((prev) => removeMessage(prev, sessionId, messageId))
  }, [publish])

  const deleteConversations = useCallback((sessionIds: string[]): void => {
    for (const sessionId of sessionIds) recordRecovery({ kind: 'session', sessionId, messages: null })
    publish((prev) => removeConversationsBySessionIds(prev, sessionIds))
  }, [publish])

  return {
    getMessages,
    appendMessage,
    updateMessage,
    replaceMessages,
    deleteMessage,
    deleteConversations,
    flushConversations
  }
}
