import React from 'react'
import { PanelLeft, Search, Settings } from 'lucide-react'
import type { ProjectItemData } from '../spotlight'
import { ProjectTree } from './ProjectTree'
import { useExpandedProjects } from './useExpandedProjects'
import type { SessionRecord } from './types'
import './sidebar.css'

export interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  projects: ProjectItemData[]
  activeProjectId?: string
  sessions: SessionRecord[]
  activeSessionId?: string
  onSelectProject: (projectId: string) => void
  onSelectSession: (sessionId: string) => void
  onNewSession: (projectId: string) => void
  onRenameSession: (sessionId: string, title: string) => void
  onDeleteSession: (sessionId: string) => void
  onDeleteProject: (projectId: string) => void
  onOpenSearch?: () => void
  onOpenSettings?: () => void
}

export function Sidebar({
  isOpen,
  onToggle,
  projects,
  activeProjectId,
  sessions,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  onDeleteProject,
  onOpenSearch,
  onOpenSettings
}: SidebarProps): React.JSX.Element {
  const { expandedIds, toggleProject, expandProject } = useExpandedProjects(projects)

  const handleNewSession = (projectId: string): void => {
    expandProject(projectId)
    onNewSession(projectId)
  }

  const handleSelectProject = (projectId: string): void => {
    toggleProject(projectId)
    onSelectProject(projectId)
  }

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
            <Search size={15} style={{ flexShrink: 0, opacity: 0.8 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Search
            </span>
          </div>

          <span className="sidebar-search-shortcut">⌘K</span>
        </button>

        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={onToggle}
          title="Close sidebar"
          aria-label="Close sidebar"
        >
          <PanelLeft size={18} />
        </button>
      </div>

      <div className="sidebar-tree">
        {projects.length === 0 ? (
          <button
            type="button"
            className="sidebar-empty-state"
            onClick={onOpenSearch}
            disabled={onOpenSearch === undefined}
          >
            <span className="sidebar-empty-title">No projects yet</span>
            <span className="sidebar-empty-hint">Press Ctrl+K to add one</span>
          </button>
        ) : (
          <>
            <div className="sidebar-section-title">Projects</div>
            <ProjectTree
              projects={projects}
              sessions={sessions}
              activeProjectId={activeProjectId}
              activeSessionId={activeSessionId}
              expandedIds={expandedIds}
              onSelectProject={handleSelectProject}
              onToggleProject={toggleProject}
              onSelectSession={onSelectSession}
              onNewSession={handleNewSession}
              onRenameSession={onRenameSession}
              onDeleteSession={onDeleteSession}
              onDeleteProject={onDeleteProject}
            />
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-settings-btn"
          onClick={onOpenSettings}
          title="Settings"
        >
          <Settings size={17} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
