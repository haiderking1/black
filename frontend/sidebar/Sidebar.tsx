import React from 'react'
import './sidebar.css'

export interface SessionItem {
  id: string
  title: string
}

export interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  sessions?: SessionItem[]
  activeSessionId?: string
  onSelectSession?: (id: string) => void
  onOpenSearch?: () => void
  onOpenSettings?: () => void
  activeProjectName?: string
}

export function Sidebar({
  isOpen,
  onToggle,
  sessions = [
    { id: '1', title: 'Architecture review' },
    { id: '2', title: 'Desktop Agent Setup' }
  ],
  activeSessionId = '1',
  onSelectSession,
  onOpenSearch,
  onOpenSettings,
  activeProjectName
}: SidebarProps): React.JSX.Element {
  return (
    <aside className={`sidebar-container ${isOpen ? '' : 'collapsed'}`}>
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-search-trigger-btn"
          onClick={onOpenSearch}
          title="Search or add projects (Ctrl+K / ⌘K)"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, opacity: 0.8 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeProjectName ? activeProjectName : 'Search'}
            </span>
          </div>

          <span className="sidebar-search-shortcut">⌘K</span>
        </button>

        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggle}
          title="Close sidebar"
          aria-label="Close sidebar"
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
      </div>

      <div className="sidebar-history">
        <div className="sidebar-section-title">Recent Chats</div>
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`sidebar-item ${s.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession?.(s.id)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, opacity: 0.7 }}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-settings-btn"
          onClick={onOpenSettings}
          title="Settings"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
