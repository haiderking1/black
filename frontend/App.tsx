import React, { useState, useEffect } from 'react'
import { PanelLeft } from 'lucide-react'
import { Sidebar, useSessions, DEFAULT_SESSION_TITLE } from './sidebar'
import { Composer } from './composer'
import { SpotlightModal, type ProjectItemData } from './spotlight'
import { createMessage, useConversations } from './chat'
import { SettingsPage, useSettings } from './settings'

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

  const { getMessages, appendMessage, deleteConversations } = useConversations()

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

  const handleSendMessage = (content: string) => {
    if (!activeProject) return

    let sessionId = activeSessionId
    if (sessionId === undefined) {
      sessionId = createSession(activeProject.id).id
    }

    // First message names the session
    const currentSession = sessions.find((s) => s.id === sessionId)
    if (currentSession === undefined || currentSession.title === DEFAULT_SESSION_TITLE) {
      renameSession(sessionId, content)
    }
    touchSession(sessionId)

    appendMessage(sessionId, createMessage('user', content))
    appendMessage(
      sessionId,
      createMessage(
        'assistant',
        `Received: "${content}". Active project: ${activeProject.name}.`
      )
    )
  }

  const messages = activeSessionId !== undefined ? getMessages(activeSessionId) : []

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
        <main
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
              style={{
                maxWidth: '800px',
                width: '100%',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
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
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* ChatGPT Composer Footer */}
        <div style={{ flexShrink: 0, width: '100%' }}>
          <Composer onSendMessage={handleSendMessage} disabled={!activeProject} />
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
