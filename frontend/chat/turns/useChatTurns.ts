import { useEffect, useRef, useState } from 'react'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import type { LanguagePreference } from '../../../contracts/language'
import type { Workflow } from '../../../contracts/workflow'
import type { ComposerSubmitOptions } from '../../composer/Composer'
import { commandFor } from '../../composer/slashCommands'
import { t } from '../../i18n'
import { describeRpcError, type ServerClient } from '../../rpc'
import { deriveSessionTitle, DEFAULT_SESSION_TITLE } from '../../sidebar/sessionStore'
import type { SessionRecord } from '../../sidebar/types'
import type { ProjectItemData } from '../../spotlight'
import { consumeWork } from '../../working/consume'
import { conversationHistory } from '../../working/history'
import { startWork } from '../../working/model'
import { finishWork } from '../../working/reducer'
import { failedTurnToResend } from '../../working/retry/turn'
import { historyBefore } from '../history'
import { newRequestId } from '../requestId'
import { createMessage, type Message } from '../types'
import { compactConversation } from './compact'
import {
  dismissSend,
  enqueueSend,
  steerSend,
  takeNextSend,
  type QueuedSend
} from './queue'
import { buildRetrySend, capturedWorkingDirectory } from './retry'

export interface UseChatTurnsOptions {
  client: ServerClient | null
  language: LanguagePreference
  workflow: Workflow
  thinkingLevel: string
  providerId: string
  selectedModelId: string | null
  activeProject: ProjectItemData | undefined
  activeSessionId: string | undefined
  sessions: readonly SessionRecord[]
  createSession: (projectId: string, model?: string, providerId?: string) => SessionRecord
  renameSession: (sessionId: string, title: string, expectedTitle?: string) => void
  updateSessionMetadata: (
    sessionId: string,
    metadata: { model?: string; providerId?: string }
  ) => void
  touchSession: (sessionId: string) => void
  getMessages: (sessionId: string) => Message[]
  appendMessage: (sessionId: string, message: Message) => void
  updateMessage: (
    sessionId: string,
    messageId: string,
    update: (previous: Message) => Message
  ) => void
  replaceMessages: (sessionId: string, messages: Message[]) => void
  deleteMessage: (sessionId: string, messageId: string) => void
  flushConversations: () => void
  onToolResult?: () => void
}

export interface UseChatTurnsResult {
  queuedSends: QueuedSend[]
  activeReplyId: string | null
  activeRequestId: string | null
  workingSessionId: string | null
  compactingSessionId: string | null
  sendMessage: (content: string, options?: ComposerSubmitOptions) => Promise<void>
  stop: () => void
  dismissQueued: (requestId: string) => void
  steerQueued: (requestId: string) => void
  retryTurn: (assistantId: string) => void
}

export function useChatTurns(options: UseChatTurnsOptions): UseChatTurnsResult {
  const {
    client,
    language,
    workflow,
    thinkingLevel,
    providerId,
    selectedModelId,
    activeProject,
    activeSessionId,
    sessions,
    createSession,
    renameSession,
    updateSessionMetadata,
    touchSession,
    getMessages,
    appendMessage,
    updateMessage,
    replaceMessages,
    deleteMessage,
    flushConversations,
    onToolResult
  } = options

  const workflowRef = useRef(workflow)
  workflowRef.current = workflow
  const languageRef = useRef(language)
  languageRef.current = language
  const clientRef = useRef(client)
  clientRef.current = client

  const [activeReplyId, setActiveReplyId] = useState<string | null>(null)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [workingSessionId, setWorkingSessionId] = useState<string | null>(null)
  const [compactingSessionId, setCompactingSessionId] = useState<string | null>(null)

  const sendQueueRef = useRef<QueuedSend[]>([])
  const [queuedSends, setQueuedSends] = useState<QueuedSend[]>([])
  const busyRef = useRef(false)

  const messagesRef = useRef(getMessages)
  useEffect(() => {
    messagesRef.current = getMessages
  }, [getMessages])

  const runCompact = async (sessionId: string, model: string): Promise<void> => {
    if (busyRef.current || clientRef.current === null || messagesRef.current(sessionId).length === 0) return
    busyRef.current = true
    setWorkingSessionId(sessionId)
    setCompactingSessionId(sessionId)
    try {
      await compactConversation({
        client: clientRef.current,
        sessionId,
        model,
        providerId,
        language: languageRef.current,
        getMessages: messagesRef.current,
        appendMessage,
        replaceMessages
      })
    } finally {
      setCompactingSessionId(null)
      setWorkingSessionId(null)
      busyRef.current = false
      const drained = takeNextSend(sendQueueRef.current)
      if (drained !== undefined) {
        sendQueueRef.current = drained.rest
        setQueuedSends(drained.rest)
        void runSend(drained.next)
      }
    }
  }

  const sendMessage = async (
    content: string,
    submitOptions?: ComposerSubmitOptions
  ): Promise<void> => {
    if (!activeProject) return

    let sessionId = activeSessionId
    if (sessionId === undefined) {
      sessionId = createSession(activeProject.id, selectedModelId ?? undefined, providerId).id
    }

    const command = commandFor(content)
    if (command !== null) {
      const commandModel = submitOptions?.model
      if (commandModel !== undefined && commandModel !== '') {
        await runCompact(sessionId, commandModel)
      }
      return
    }

    const currentSession = sessions.find((session) => session.id === sessionId)
    if (
      getMessages(sessionId).length === 0 &&
      (currentSession === undefined || currentSession.title === DEFAULT_SESSION_TITLE)
    ) {
      const fallback = deriveSessionTitle(
        content.trim() === '' ? t(languageRef.current, 'chat.image') : content
      )
      renameSession(sessionId, fallback)
      const titleSessionId = sessionId
      const titleModel = submitOptions?.model || selectedModelId
      const titleClient = clientRef.current
      if (titleModel && titleClient !== null) {
        void Effect.runPromise(
          titleClient['chat.title']({
            providerId,
            model: titleModel,
            message: content,
            sessionId: titleSessionId
          })
        )
          .then(({ title }) => renameSession(titleSessionId, title, fallback))
          .catch(() => {
            // Naming must never interrupt a reply. Keep the first-message fallback.
          })
      }
    }
    touchSession(sessionId)

    const images = submitOptions?.images ?? []
    const userMessage: Message = {
      ...createMessage('user', content),
      ...(images.length === 0 ? {} : { images })
    }
    appendMessage(sessionId, userMessage)

    const workingDirectory = capturedWorkingDirectory(activeProject.path)
    const send: QueuedSend = {
      requestId: newRequestId(),
      sessionId,
      messageId: userMessage.id,
      content,
      options: submitOptions,
      providerId,
      ...(submitOptions?.route !== undefined ? { route: submitOptions.route } : {}),
      ...(workingDirectory === undefined ? {} : { workingDirectory }),
      images
    }

    if (busyRef.current) {
      sendQueueRef.current = enqueueSend(sendQueueRef.current, send)
      setQueuedSends(sendQueueRef.current)
      return
    }

    await runSend(send)
  }

  const runSend = async (send: QueuedSend): Promise<void> => {
    const threadId = send.sessionId
    const capturedWorkflow = workflowRef.current
    const model = send.options?.model
    const stream = clientRef.current

    busyRef.current = true
    setWorkingSessionId(threadId)
    if (model) {
      updateSessionMetadata(threadId, { model, providerId: send.providerId })
    }

    try {
      if (stream === null || model === undefined || model === '') {
        appendMessage(threadId, createMessage('assistant', t(languageRef.current, 'chat.noModel')))
        return
      }

      const priorTurns = conversationHistory(
        historyBefore(messagesRef.current(threadId), send.messageId)
      )

      const reply = { ...createMessage('assistant', ''), work: startWork() }
      appendMessage(threadId, reply)

      setActiveReplyId(reply.id)
      setActiveRequestId(send.requestId)

      const patch = (update: (previous: Message) => Message): void => {
        updateMessage(threadId, reply.id, update)
      }

      try {
        const events = stream['chat.stream']({
          providerId: send.providerId,
          model,
          messages: [
            ...priorTurns,
            {
              id: send.messageId,
              role: 'user',
              content: send.content,
              ...(send.images.length === 0 ? {} : { images: send.images })
            }
          ],
          requestId: send.requestId,
          workflow: capturedWorkflow,
          sessionId: send.sessionId,
          ...(send.workingDirectory !== undefined ? { workingDirectory: send.workingDirectory } : {}),
          ...(send.options?.thinkingLevel !== undefined
            ? { thinkingLevel: send.options.thinkingLevel }
            : {}),
          ...(send.route !== undefined ? { route: send.route } : {}),
          language: languageRef.current
        })

        await consumeWork(
          Stream.tap(events, (event) =>
            Effect.sync(() => {
              if (event.type === 'tool_result') onToolResult?.()
            })
          ),
          patch
        )
      } catch (error) {
        const at = Date.now()
        patch((message) => finishWork(message, 'interrupted', at, describeRpcError(error)))
      }
    } finally {
      flushConversations()
      busyRef.current = false
      setActiveReplyId(null)
      setActiveRequestId(null)
      setWorkingSessionId(null)

      const drained = takeNextSend(sendQueueRef.current)
      if (drained !== undefined) {
        sendQueueRef.current = drained.rest
        setQueuedSends(drained.rest)
        void runSend(drained.next)
      }
    }
  }

  const stop = (): void => {
    const requestId = activeRequestId
    const stream = clientRef.current
    if (requestId === null || stream === null) return
    void Effect.runPromise(stream['chat.cancel']({ requestId })).catch(() => undefined)
  }

  const dismissQueued = (requestId: string): void => {
    const dismissed = dismissSend(sendQueueRef.current, requestId)
    if (dismissed === undefined) return
    sendQueueRef.current = dismissed.rest
    setQueuedSends(dismissed.rest)
    deleteMessage(dismissed.removed.sessionId, dismissed.removed.messageId)
  }

  const steerQueued = (requestId: string): void => {
    const steered = steerSend(sendQueueRef.current, requestId)
    if (steered === undefined) return
    sendQueueRef.current = steered
    setQueuedSends(steered)
    stop()
  }

  const retryTurn = (assistantId: string): void => {
    if (busyRef.current || activeSessionId === undefined) return
    const sessionId = activeSessionId
    const user = failedTurnToResend(messagesRef.current(sessionId), assistantId)
    if (user === undefined) return

    deleteMessage(sessionId, assistantId)
    void runSend(
      buildRetrySend({
        sessionId,
        user,
        model: selectedModelId ?? undefined,
        providerId,
        thinkingLevel,
        workingDirectory: activeProject?.path
      })
    )
  }

  return {
    queuedSends,
    activeReplyId,
    activeRequestId,
    workingSessionId,
    compactingSessionId,
    sendMessage,
    stop,
    dismissQueued,
    steerQueued,
    retryTurn
  }
}
