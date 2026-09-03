import React, { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'
import { Composer } from './composer'
import { SpotlightModal, type ProjectItemData } from './spotlight'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const DEFAULT_PROJECTS: ProjectItemData[] = [
  { id: 'proj-black', name: 'black', path: '/home/soka/code/black' }
]

export function App(): React.JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])

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
    return DEFAULT_PROJECTS[0]?.id || ''
  })

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

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSpotlightOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0]

  const handleSelectProject = (project: ProjectItemData) => {
    setActiveProjectId(project.id)
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
    const remaining = projects.filter((p) => p.id !== id)
    setProjects(remaining)
    if (activeProjectId === id) {
      setActiveProjectId(remaining[0]?.id || '')
    }
  }

  const handleSendMessage = (content: string) => {
    const userMsg: Message = {
      id: String(Date.now()),
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const assistantMsg: Message = {
      id: String(Date.now() + 1),
      role: 'assistant',
      content: `Received: "${content}". Active project: ${activeProject ? activeProject.name : 'None'}.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: 'var(--bg-main)' }}>
      {/* Collapsible Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        onOpenSearch={() => setSpotlightOpen(true)}
        activeProjectName={activeProject?.name}
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
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
            )}

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '16px',
                userSelect: 'none'
              }}
            >
              <span>Black</span>
              {activeProject && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-surface)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer'
                  }}
                  onClick={() => setSpotlightOpen(true)}
                  title="Switch or browse projects"
                >
                  {activeProject.name}
                </span>
              )}
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
          <Composer onSendMessage={handleSendMessage} />
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
