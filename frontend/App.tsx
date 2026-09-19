import React, { useEffect, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { WorkspaceTitle } from './workspace/WorkspaceTitle'
import { Sidebar, useProjects, useSessions } from './sidebar'
import { Composer, QueuedMessages } from './composer'
import { SpotlightModal } from './spotlight'
import { refreshProjectGit } from './sidebar/useProjectGit'
import { JumpToLatest, useChatTurns, useContextUsage, useConversations, useStickToBottom } from './chat'
import { WorkingSection } from './working/WorkingSection'
import { PreviewImage, PreviewProvider } from './lightbox'
import { useRpcClient } from './rpc'
import './chat/chat-scroll.css'
import { useFloatingComposer } from './chat/floating-composer/useFloatingComposer'
import './chat/message-images.css'
import { LanguageProvider, directionFor, langFor } from './language'
import { t } from './i18n'
import { SettingsPage, useSettings } from './settings'
import { useProviders } from './settings/useProviders'
import { usePrefetchCatalogs } from './composer/models/usePrefetchCatalogs'
import { activeProviderId, pickerRail, providerDisplayName } from './settings/activeProvider'
import { readRoute, toChatRoute } from './composer/routing/storage'

type AppView = 'chat' | 'settings'

export function App(): React.JSX.Element {
  const { settings, updateSetting, resetSettings } = useSettings()
  const [sidebarOpen, setSidebarOpen] = useState(() => settings.openSidebarOnLaunch)
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  const [appView, setAppView] = useState<AppView>('chat')

  const {
    projects,
    activeProjectId,
    activeProject,
    currentProjectId,
    selectProject,
    addProject,
    removeProject
  } = useProjects()

  const {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    renameSession,
    updateSessionMetadata,
    deleteSession,
    touchSession,
    deleteSessionsForProject
  } = useSessions(projects, currentProjectId)

  const {
    getMessages,
    appendMessage,
    updateMessage,
    replaceMessages,
    deleteMessage,
    deleteConversations,
    flushConversations
  } = useConversations()

  const { scrollRef, contentRef, handleScroll, isPinned, isAtBottom, jumpToBottom } = useStickToBottom(activeSessionId)
  const { frameRef, footerRef } = useFloatingComposer(scrollRef, isPinned)
  const client = useRpcClient()
  const { providers } = useProviders()
  usePrefetchCatalogs(providers)

  // A session may pin its own model/provider. The settings pair remains the
  // default for sessions that have not chosen one yet.

  const activeSession = activeSessionId === undefined
    ? undefined
    : sessions.find((session) => session.id === activeSessionId && session.projectId === currentProjectId)
  const selectedModelId = activeSession?.model ?? settings.selectedModelId
  const selectedProviderId = activeSession?.providerId ?? settings.selectedProviderId
  const providerId = activeProviderId(selectedProviderId, providers)
  const providerName = providerDisplayName(providerId, providers)
  const pickerProviders = pickerRail(providers)

  const {
    queuedSends,
    activeReplyId,
    workingSessionId,
    sendMessage,
    stop,
    dismissQueued,
    steerQueued,
    retryTurn
  } = useChatTurns({
    client,
    language: settings.language,
    workflow: settings.workflow,
    thinkingLevel: settings.thinkingLevel,
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
    onToolResult: refreshProjectGit
  })

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

  const handleSidebarSelectSession = (sessionId: string) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (!session) return
    selectProject(session.projectId)
    setActiveSession(session.projectId, sessionId)
  }

  const handleSidebarDeleteSession = (sessionId: string) => {
    deleteConversations([sessionId])
    deleteSession(sessionId)
  }

  const handleRemoveProject = (id: string) => {
    // Drop conversations first. Removing the project also drops its sessions,
    // and a session gone from the tree would leave its transcript stranded.
    const removedSessionIds = sessions
      .filter((session) => session.projectId === id)
      .map((session) => session.id)
    deleteConversations(removedSessionIds)
    deleteSessionsForProject(id)
    removeProject(id)
  }

  const messages = activeSessionId !== undefined ? getMessages(activeSessionId) : []
  // Measured from the transcript, so it is there as soon as a conversation is
  // open rather than only after a message has been sent.
  const contextUsage = useContextUsage(
    providerId,
    selectedModelId,
    messages,
    providerId === 'openrouter' && selectedModelId !== null
      ? toChatRoute(readRoute(selectedModelId))
      : undefined
  )

  if (appView === 'settings') {
    return (
      <LanguageProvider language={settings.language}>
        <PreviewProvider>
          <SettingsPage
            projects={projects}
            settings={settings}
            onChange={updateSetting}
            onReset={resetSettings}
            onClose={() => setAppView('chat')}
          />
        </PreviewProvider>
      </LanguageProvider>
    )
  }

  return (
    <LanguageProvider language={settings.language}>
    <PreviewProvider>
    <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: 'var(--bg-main)' }}>
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        projects={projects}
        activeProjectId={activeProject?.id}
        sessions={sessions}
        activeSessionId={activeSessionId}
        workingSessionId={workingSessionId}
        activeModelId={selectedModelId}
        activeProviderId={providerId}
        onSelectProject={selectProject}
        onSelectSession={handleSidebarSelectSession}
        onNewSession={createSession}
        onRenameSession={renameSession}
        onDeleteSession={handleSidebarDeleteSession}
        onDeleteProject={handleRemoveProject}
        onOpenSearch={() => setSpotlightOpen(true)}
        onOpenSettings={() => {
          setSpotlightOpen(false)
          setAppView('settings')
        }}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title={t(settings.language, 'sidebar.open')}
                style={{
                  flexShrink: 0,
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)'
                }}
              >
                <PanelLeft size={18} className="rtl-flip" />
              </button>
            )}

            <WorkspaceTitle
              projectName={activeProject?.name}
              sessionTitle={sessions.find(session => session.id === activeSessionId && session.projectId === activeProject?.id)?.title}
            />
          </div>
        </header>

        <div className="floating-chat" ref={frameRef}>
        <main
          ref={scrollRef}
          className="floating-chat-scroll"
          onScroll={handleScroll}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}
        >
          {messages.length === 0 ? (
            <div className="chat-column chat-empty">
              <h1
                style={{
                  fontSize: '32px',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                  textAlign: 'center'
                }}
              >
                {t(settings.language, 'chat.empty')}
              </h1>
            </div>
          ) : (
            <div
              ref={contentRef}
              className="chat-column chat-transcript"
            >
              {messages.map((m) => {
                const last = messages.at(-1)
                const canRetry = m.id === last?.id && activeReplyId === null
                  && (m.work?.status === 'failed' || m.work?.status === 'interrupted')
                return (
                <div
                  key={m.id}
                  className={m.role === 'user' ? 'user-turn' : 'assistant-turn'}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
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
                      <WorkingSection message={m} active={m.id === activeReplyId}
                        {...(canRetry ? { onRetry: () => retryTurn(m.id) } : {})}
                        onExpandedChange={(expanded, blockKey) => {
                          if (activeSessionId === undefined) return
                          updateMessage(activeSessionId, m.id, previous => previous.work === undefined
                            ? { ...previous, workExpanded: expanded }
                            : { ...previous, work: { ...previous.work, ...(blockKey === undefined ? { expanded }
                              : { expandedBlocks: { ...previous.work.expandedBlocks, [blockKey]: expanded } }) } })
                        }} />
                    ) : (
                      <>
                        {/* Above the text, in the order the message reads: the
                            picture, then what was said about it. */}
                        {m.images === undefined || m.images.length === 0 ? null : (
                          <div className="message-images">
                            {m.images.map((image, index) => (
                              <PreviewImage
                                key={String(index) + image.mimeType}
                                className="message-image"
                                src={'data:' + image.mimeType + ';base64,' + image.data}
                                {...(image.name === undefined ? {} : { name: image.name })}
                                alt={t(settings.language, 'chat.attachedImage')}
                              />
                            ))}
                          </div>
                        )}
                        {m.content === '' ? null : (
                          <span
                            className="user-message-text"
                            dir={directionFor(settings.language, m.content)}
                            lang={langFor(settings.language, m.content)}
                          >
                            {m.content}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </main>
        <JumpToLatest visible={!isAtBottom} onClick={() => jumpToBottom()} />

        <div className="floating-composer" ref={footerRef}>
          <QueuedMessages
            messages={queuedSends}
            onDismiss={dismissQueued}
            onSteer={steerQueued}
          />
          <Composer
            onSendMessage={sendMessage}
            disabled={!activeProject}
            streaming={activeReplyId !== null}
            onStop={stop}
            contextUsage={contextUsage}
            providerId={providerId}
            providers={pickerProviders}
            model={selectedModelId}
            onSelectModel={(modelId, selectedProviderId) => {
              updateSetting('selectedProviderId', selectedProviderId)
              updateSetting('selectedModelId', modelId)
            }}
            {...(activeSessionId !== undefined ? {
              onPickModel: (modelId: string, selectedProviderId: string) => {
                updateSessionMetadata(activeSessionId, { model: modelId, providerId: selectedProviderId })
              }
            } : {})}
            thinkingLevel={settings.thinkingLevel}
            onSelectThinkingLevel={(level) => updateSetting('thinkingLevel', level)}
            {...(providerName !== undefined ? { providerName } : {})}
          />
        </div>
        </div>
      </div>

      <SpotlightModal
        isOpen={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={(project) => selectProject(project.id)}
        onAddProject={addProject}
        onRemoveProject={handleRemoveProject}
      />
    </div>
    </PreviewProvider>
    </LanguageProvider>
  )
}
