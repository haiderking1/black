import React, { useEffect, useRef, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { Sidebar, useSessions, DEFAULT_SESSION_TITLE } from './sidebar'
import { Composer, QueuedMessages, commandFor } from './composer'
import { SpotlightModal, type ProjectItemData } from './spotlight'
import * as Effect from 'effect/Effect'
import { applyToolResult, consumeReply, createMessage, historyBefore, JumpToLatest, newRequestId, startToolRun, useContextUsage, useConversations, useStickToBottom } from './chat'
import type { Message } from './chat'
import { ToolRunList } from './tools'
import { describeRpcError, useRpcClient } from './rpc'
import type { ComposerSubmitOptions } from './composer'
import { Markdown } from './markdown'
import { CompactionNotice } from './compaction'
import { ThinkingBlock } from './thinking'
import './chat/chat-scroll.css'
import { SettingsPage, useSettings } from './settings'
import { useProviders } from './settings/useProviders'

/** A turn typed while a reply was arriving, waiting for that reply to finish. */
interface QueuedSend {
  requestId: string
  sessionId: string
  /** The user message already appended for this turn. */
  messageId: string
  content: string
  options: ComposerSubmitOptions | undefined
}

const DEFAULT_PROJECTS: ProjectItemData[] = [
  { id: 'proj-black', name: 'black', path: '/home/soka/code/black' }
]

type AppView = 'chat' | 'settings'

export function App(): React.JSX.Element {
  const { settings, updateSetting, resetSettings } = useSettings()
  const [sidebarOpen, setSidebarOpen] = useState(() => settings.openSidebarOnLaunch)
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  const [appView, setAppView] = useState<AppView>('chat')

  // Project state with localStorage persistence
  const [projects, setProjects] = useState<ProjectItemData[]>(() => {
    try {
      const saved = localStorage.getItem('black_projects')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (p) =>
              p &&
              typeof p.id === 'string' &&
              typeof p.name === 'string' &&
              typeof p.path === 'string'
          )
        ) {
          return parsed
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_PROJECTS
  })

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('black_active_project_id')
      if (saved) return saved
    } catch {
      // ignore
    }
    return DEFAULT_PROJECTS[0]?.id ?? ''
  })

  const {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    renameSession,
    deleteSession,
    touchSession,
    deleteSessionsForProject
  } = useSessions(projects, activeProjectId)

  const {
    getMessages,
    appendMessage,
    updateMessage,
    replaceMessages,
    deleteMessage,
    deleteConversations
  } = useConversations()

  // Follows new content, and releases the moment the reader scrolls up.
  const { scrollRef, contentRef, handleScroll, isPinned, jumpToBottom } = useStickToBottom(activeSessionId)
  const client = useRpcClient()

  // Only for the provider's display name, which the picker labels its rows with.
  const { providers } = useProviders()
  const providerName = providers.find((entry) => entry.id === 'opencode-go')?.name

  // The message still arriving. Only that one keeps shimmering; the rest are
  // settled and should read as history.
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null)

  // The id of the turn being streamed, so it can be stopped.
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)

  // Turns typed while a reply was arriving, oldest first. The ref is what the
  // drain reads; the state is the same list, for rendering.
  const sendQueueRef = useRef<QueuedSend[]>([])
  const [queuedSends, setQueuedSends] = useState<QueuedSend[]>([])

  // True from the moment a send starts until its stream ends. A ref rather than
  // a check on activeReplyId, because the reply is appended a tick later and a
  // second turn landing in that gap would start a stream beside the first.
  const busyRef = useRef(false)

  // The queue drains from a closure created during an earlier render, so it has
  // to read the conversation as it is now rather than as it was then.
  const messagesRef = useRef(getMessages)
  useEffect(() => {
    messagesRef.current = getMessages
  }, [getMessages])

  useEffect(() => {
    try {
      localStorage.setItem('black_projects', JSON.stringify(projects))
    } catch {
      // ignore
    }
  }, [projects])

  useEffect(() => {
    try {
      if (activeProjectId) {
        localStorage.setItem('black_active_project_id', activeProjectId)
      } else {
        localStorage.removeItem('black_active_project_id')
      }
    } catch {
      // ignore
    }
  }, [activeProjectId])

  // Repair a stale active project id after removals or corrupt storage
  useEffect(() => {
    if (projects.length === 0) return
    if (projects.some((p) => p.id === activeProjectId)) return
    const fallback = projects[0]
    if (fallback) setActiveProjectId(fallback.id)
  }, [projects, activeProjectId])

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (appView !== 'chat') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSpotlightOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [appView])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0]

  const handleSelectProject = (project: ProjectItemData) => {
    setActiveProjectId(project.id)
  }

  const handleSidebarSelectProject = (projectId: string) => {
    setActiveProjectId(projectId)
  }

  const handleSidebarSelectSession = (sessionId: string) => {
    if (!activeProject) return
    setActiveSession(activeProject.id, sessionId)
  }

  const handleSidebarNewSession = (projectId: string) => {
    createSession(projectId)
  }

  const handleSidebarDeleteSession = (sessionId: string) => {
    deleteConversations([sessionId])
    deleteSession(sessionId)
  }

  const handleAddProject = (project: ProjectItemData) => {
    const exists = projects.find((p) => p.path === project.path)
    if (exists) {
      setActiveProjectId(exists.id)
      return
    }

    setActiveProjectId(project.id)
    setProjects((prev) => [project, ...prev])
  }

  const handleRemoveProject = (id: string) => {
    const removedSessionIds = sessions
      .filter((s) => s.projectId === id)
      .map((s) => s.id)
    deleteConversations(removedSessionIds)
    deleteSessionsForProject(id)

    const remaining = projects.filter((p) => p.id !== id)
    setProjects(remaining)
    if (activeProjectId === id) {
      setActiveProjectId(remaining[0]?.id ?? '')
    }
  }

  /**
   * Folds the older turns into a checkpoint, now rather than when the window
   * fills.
   *
   * The transcript is replaced, not just the request. Compaction only changes
   * what gets sent, so leaving the old turns on screen would mean every later
   * turn summarized the same history again at full cost.
   */
  const runCompact = async (sessionId: string, model: string): Promise<void> => {
    if (client === null) return

    const existing = messagesRef.current(sessionId)
    if (existing.length === 0) return

    try {
      const result = await Effect.runPromise(
        client['chat.compact']({
          providerId: 'opencode-go',
          model,
          messages: existing.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content
          })),
          sessionId
        })
      )

      // Saying nothing would leave the reader unsure whether the command ran.
      // The usual cause is a conversation shorter than the recent history black
      // always keeps, which leaves nothing to fold up.
      if (!result.compacted) {
        appendMessage(
          sessionId,
          createMessage(
            'assistant',
            'Nothing to compact yet. The conversation is already smaller than the recent history black keeps.'
          )
        )
        return
      }

      const cut = existing.findIndex((message) => message.id === result.firstKeptMessageId)
      const kept = cut === -1 ? [] : existing.slice(cut)

      replaceMessages(sessionId, [createMessage('assistant', result.summary), ...kept])
    } catch (error) {
      appendMessage(sessionId, createMessage('assistant', describeRpcError(error)))
    }
  }

  /** Appends the turn, then sends it or queues it behind the one running. */
  const handleSendMessage = async (
    content: string,
    options?: ComposerSubmitOptions
  ): Promise<void> => {
    if (!activeProject) return

    let sessionId = activeSessionId
    if (sessionId === undefined) {
      sessionId = createSession(activeProject.id).id
    }

    // A command is an instruction about the conversation, not a turn in it, so
    // it never reaches the transcript and never names the session.
    const command = commandFor(content)
    if (command !== null) {
      const commandModel = options?.model
      if (commandModel !== undefined && commandModel !== '') {
        await runCompact(sessionId, commandModel)
      }
      return
    }

    // First message names the session
    const currentSession = sessions.find((s) => s.id === sessionId)
    if (currentSession === undefined || currentSession.title === DEFAULT_SESSION_TITLE) {
      renameSession(sessionId, content)
    }
    touchSession(sessionId)

    const userMessage = createMessage('user', content)
    appendMessage(sessionId, userMessage)

    const send: QueuedSend = {
      requestId: newRequestId(),
      sessionId,
      messageId: userMessage.id,
      content,
      options
    }

    if (busyRef.current) {
      // A reply is still arriving. Hold this turn rather than starting a second
      // stream beside it: two replies writing into one conversation interleave,
      // and neither can be stopped without stopping the other.
      sendQueueRef.current = [...sendQueueRef.current, send]
      setQueuedSends(sendQueueRef.current)
      return
    }

    await runSend(send)
  }

  /** Runs one turn to completion, then releases whatever waited behind it. */
  const runSend = async (send: QueuedSend): Promise<void> => {
    const threadId = send.sessionId
    const model = send.options?.model
    const stream = client

    busyRef.current = true

    try {
      if (stream === null || model === undefined || model === '') {
        appendMessage(
          threadId,
          createMessage(
            'assistant',
            'No model is available. Add an API key in Settings, then choose a model in the composer.'
          )
        )
        return
      }

      // The turn's own message is already in the transcript, so the history
      // stops before it. Taking everything would ask the question twice.
      // Ids travel with the turns: compaction names its cut point by entry id.
      const priorTurns = historyBefore(messagesRef.current(threadId), send.messageId).map(
        (message) => ({ id: message.id, role: message.role, content: message.content })
      )

      // The reply is appended empty and filled in as events arrive, so the answer
      // renders while it is still being written rather than after the last token.
      const reply = createMessage('assistant', '')
      appendMessage(threadId, reply)

      setActiveReplyId(reply.id)
      setActiveRequestId(send.requestId)

      const patch = (update: (previous: Message) => Message): void => {
        updateMessage(threadId, reply.id, update)
      }

      let stopReason: string | undefined

      try {
        const events = stream['chat.stream']({
          providerId: 'opencode-go',
          model,
          messages: [
            ...priorTurns,
            { id: send.messageId, role: 'user', content: send.content }
          ],
          requestId: send.requestId,
          // The conversation id doubles as the provider's routing key, so a whole
          // thread stays on one upstream.
          sessionId: send.sessionId,
          // The open project is the directory this turn is about. Without it the
          // model is asked about a repository it was never told the location of.
          ...(activeProject?.path !== undefined && activeProject.path !== ''
            ? { workingDirectory: activeProject.path }
            : {}),
          ...(send.options?.thinkingLevel !== undefined
            ? { thinkingLevel: send.options.thinkingLevel }
            : {})
        })

        await consumeReply(events, {
          onThinking: (delta) => patch((m) => ({ ...m, thinking: (m.thinking ?? '') + delta })),
          onThinkingDone: (elapsedMs) => patch((m) => ({ ...m, thinkingMs: elapsedMs })),
          onText: (delta) => patch((m) => ({ ...m, content: m.content + delta })),
          onFailure: (message) => patch((m) => ({ ...m, content: message })),
          onCompacted: (before, after) =>
            patch((m) => ({
              ...m,
              compacted: after === undefined ? { before } : { before, after }
            })),
          // Rows appear as the model asks for them, so a slow read shows up as
          // work in progress rather than as a reply that has stopped moving.
          onToolCalls: (calls) =>
            patch((m) => ({ ...m, tools: [...(m.tools ?? []), ...calls.map(startToolRun)] })),
          onToolResult: (callId, result, isError, details, images) =>
            patch((m) => ({
              ...m,
              tools: applyToolResult(m.tools ?? [], callId, result, isError, details, images)
            })),
          onDone: (report) => {
            stopReason = report.stopReason
          }
        })

        // An empty bubble reads as a bug; say what happened instead. A stopped
        // turn is its own case: nothing was answered because nothing was asked
        // to finish.
        patch((m) => {
          if (m.content !== '') return m
          return { ...m, content: stopReason === 'aborted' ? '(stopped)' : '(empty reply)' }
        })
      } catch (error) {
        patch((m) => ({ ...m, content: describeRpcError(error) }))
      }
    } finally {
      busyRef.current = false
      setActiveReplyId(null)
      setActiveRequestId(null)

      // Whatever waited for this turn goes now, oldest first.
      const next = sendQueueRef.current[0]
      if (next !== undefined) {
        sendQueueRef.current = sendQueueRef.current.slice(1)
        setQueuedSends(sendQueueRef.current)
        void runSend(next)
      }
    }
  }

  /** Stops the reply that is arriving, without adding anything to the transcript. */
  const handleStop = (): void => {
    const requestId = activeRequestId
    if (requestId === null || client === null) return

    // A failure is not reported. Losing this race means the reply ended on its
    // own a moment earlier, and the stream clears the UI either way.
    void Effect.runPromise(client['chat.cancel']({ requestId })).catch(() => undefined)
  }

  /**
   * Takes one queued turn back out, message and all.
   *
   * The user message was appended when the turn was queued, so dropping only the
   * queue entry would leave a question in the transcript that nothing will ever
   * answer.
   */
  const handleDismissQueued = (requestId: string): void => {
    const queued = sendQueueRef.current.find((send) => send.requestId === requestId)
    if (queued === undefined) return

    sendQueueRef.current = sendQueueRef.current.filter((send) => send.requestId !== requestId)
    setQueuedSends(sendQueueRef.current)
    deleteMessage(queued.sessionId, queued.messageId)
  }

  /**
   * Moves a queued turn to the front and stops the reply that is running.
   *
   * The running reply is cancelled rather than left to finish, because the point
   * of steering is to change direction now. The queue drains the moment that
   * stream ends, so the moved turn goes next either way.
   */
  const handleSteerQueued = (requestId: string): void => {
    const queued = sendQueueRef.current
    const target = queued.find((send) => send.requestId === requestId)
    if (target === undefined) return

    sendQueueRef.current = [target, ...queued.filter((send) => send.requestId !== requestId)]
    setQueuedSends(sendQueueRef.current)

    handleStop()
  }

  const messages = activeSessionId !== undefined ? getMessages(activeSessionId) : []

  // Measured from the transcript, so it is there as soon as a conversation is
  // open rather than only after a message has been sent.
  const contextUsage = useContextUsage('opencode-go', settings.selectedModelId, messages)

  if (appView === 'settings') {
    return (
      <SettingsPage
        settings={settings}
        onChange={updateSetting}
        onReset={resetSettings}
        onClose={() => setAppView('chat')}
      />
    )
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: 'var(--bg-main)' }}>
      {/* Collapsible Sidebar with project/session tree */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        projects={projects}
        activeProjectId={activeProject?.id}
        sessions={sessions}
        activeSessionId={activeSessionId}
        activeProjectName={activeProject?.name}
        onSelectProject={handleSidebarSelectProject}
        onSelectSession={handleSidebarSelectSession}
        onNewSession={handleSidebarNewSession}
        onRenameSession={renameSession}
        onDeleteSession={handleSidebarDeleteSession}
        onDeleteProject={handleRemoveProject}
        onOpenSearch={() => setSpotlightOpen(true)}
        onOpenSettings={() => {
          setSpotlightOpen(false)
          setAppView('settings')
        }}
      />

      {/* Main Chat Workspace */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
        {/* Top Header */}
        <header
          style={{
            height: '52px',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title="Open sidebar"
                style={{
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)'
                }}
              >
                <PanelLeft size={18} />
              </button>
            )}

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '16px',
                userSelect: 'none'
              }}
            >
              <span>Black</span>
            </div>
          </div>
        </header>

        {/* Chat / Content Flow */}
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
        <main
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '0 16px'
          }}
        >
          {messages.length === 0 ? (
            /* Empty State: Clean Greeting */
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                maxWidth: '800px',
                width: '100%',
                margin: '0 auto',
                paddingBottom: '32px'
              }}
            >
              <h1
                style={{
                  fontSize: '32px',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                  textAlign: 'center'
                }}
              >
                What can I help with today?
              </h1>
            </div>
          ) : (
            /* Conversation Messages Stream */
            <div
              ref={contentRef}
              style={{
                maxWidth: '800px',
                width: '100%',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                // Must not shrink. A flex item that shrinks to fit stays one
                // viewport tall however long the transcript gets, so the
                // ResizeObserver watching it never sees content arrive and the
                // follow never fires.
                flexShrink: 0,
                gap: '24px',
                paddingTop: '20px',
                paddingBottom: '32px'
              }}
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                    width: '100%'
                  }}
                >
                  <div
                    style={{
                      maxWidth: m.role === 'user' ? '75%' : '100%',
                      padding: m.role === 'user' ? '10px 16px' : '4px 0',
                      borderRadius: m.role === 'user' ? '18px' : '0',
                      backgroundColor: m.role === 'user' ? 'var(--bg-surface)' : 'transparent',
                      border: m.role === 'user' ? '1px solid var(--border-subtle)' : 'none',
                      color: 'var(--text-primary)',
                      fontSize: '15px',
                      lineHeight: '1.6'
                    }}
                  >
                    {/* Assistant turns are markdown. User text is left exactly as
                        typed, so a stray asterisk is not silently emphasis. */}
                    {m.role === 'assistant' ? (
                      <>
                        {m.compacted !== undefined ? (
                          <CompactionNotice
                            tokensBefore={m.compacted.before}
                            tokensAfter={m.compacted.after}
                            /* Still working until the answer starts, which is
                               when the label stops sweeping. */
                            isStreaming={m.id === activeReplyId && m.content === ''}
                          />
                        ) : null}
                        {m.thinking !== undefined && m.thinking !== '' ? (
                          <ThinkingBlock
                            thinking={m.thinking}
                            isStreaming={m.id === activeReplyId && m.thinkingMs === undefined}
                            durationMs={m.thinkingMs}
                          />
                        ) : null}
                        {/* Before the answer, because that is the order they
                            happened in: the model read and edited first, then
                            said what it found. */}
                        <ToolRunList runs={m.tools ?? []} />
                        {/* Nothing until text arrives, so an answer that has not
                            started leaves no gap under the reasoning. */}
                        {m.content === '' ? null : <Markdown>{m.content}</Markdown>}
                      </>
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
        <JumpToLatest visible={!isPinned} onClick={() => jumpToBottom()} />
        </div>

        {/* ChatGPT Composer Footer */}
        <div style={{ flexShrink: 0, width: '100%' }}>
          <QueuedMessages
            messages={queuedSends}
            onDismiss={handleDismissQueued}
            onSteer={handleSteerQueued}
          />
          <Composer
            onSendMessage={handleSendMessage}
            disabled={!activeProject}
            streaming={activeReplyId !== null}
            onStop={handleStop}
            contextUsage={contextUsage}
            model={settings.selectedModelId}
            onSelectModel={(modelId) => updateSetting('selectedModelId', modelId)}
            thinkingLevel={settings.thinkingLevel}
            onSelectThinkingLevel={(level) => updateSetting('thinkingLevel', level)}
            {...(providerName !== undefined ? { providerName } : {})}
          />
        </div>
      </div>

      {/* Spotlight Project & Directory Navigator Modal */}
      <SpotlightModal
        isOpen={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
      />
    </div>
  )
}
