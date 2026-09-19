import React from 'react'
import { PanelLeft, Search, Settings, SquarePen } from 'lucide-react'
import type { ProjectItemData } from '../spotlight'
import { ProjectTree } from './ProjectTree'
import { useExpandedProjects } from './useExpandedProjects'
import type { SessionRecord } from './types'
import { useT } from '../i18n'
import './sidebar.css'

export interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  projects: ProjectItemData[]
  activeProjectId?: string
  sessions: SessionRecord[]
  activeSessionId?: string
  workingSessionId?: string | null
  activeModelId?: string | null
  activeProviderId?: string
  onSelectProject: (projectId: string) => void
  onSelectSession: (sessionId: string, projectId?: string) => void
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
  workingSessionId,
  activeModelId,
  activeProviderId,
  onSelectProject,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  onDeleteProject,
  onOpenSearch,
  onOpenSettings
}: SidebarProps): React.JSX.Element {
  const t = useT()
  const { expandedIds, toggleProject, expandProject } = useExpandedProjects(projects)

  const handleNewSession = (projectId: string): void => {
    expandProject(projectId)
    onNewSession(projectId)
  }

  const handleSelectProject = (projectId: string): void => {
    toggleProject(projectId)
    onSelectProject(projectId)
  }

  const handleQuickNewChat = (): void => {
    const targetProjectId = activeProjectId || projects[0]?.id
    if (targetProjectId) {
      handleNewSession(targetProjectId)
    }
  }

  return (
    <aside className={`sidebar-container ${isOpen ? '' : 'collapsed'}`}>
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-search-trigger-btn"
          onClick={onOpenSearch}
          title={t('sidebar.searchTitle')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <Search size={14} style={{ flexShrink: 0, opacity: 0.8 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('sidebar.search')}
            </span>
          </div>

          <span className="sidebar-search-shortcut">⌘K</span>
        </button>

        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={handleQuickNewChat}
          title={t('sidebar.newChat')}
          aria-label={t('sidebar.newChat')}
          disabled={projects.length === 0}
        >
          <SquarePen size={16} strokeWidth={1.8} />
        </button>

        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={onToggle}
          title={t('sidebar.close')}
          aria-label={t('sidebar.close')}
        >
          <PanelLeft size={17} className="rtl-flip" />
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
            <span className="sidebar-empty-title">{t('sidebar.empty')}</span>
            <span className="sidebar-empty-hint">{t('sidebar.emptyHint')}</span>
          </button>
        ) : (
          <>
            <div className="sidebar-section-title">{t('sidebar.projects')}</div>
            <ProjectTree
              projects={projects}
              sessions={sessions}
              activeProjectId={activeProjectId}
              activeSessionId={activeSessionId}
              workingSessionId={workingSessionId}
              activeModelId={activeModelId}
              activeProviderId={activeProviderId}
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
          title={t('sidebar.settings')}
        >
          <Settings size={16} />
          <span>{t('sidebar.settings')}</span>
        </button>
      </div>
    </aside>
  )
}
