import React from 'react'
import type { ProjectItemData } from '../spotlight'
import { ProjectRow } from './ProjectRow'
import { SessionRow } from './SessionRow'
import type { SessionRecord } from './types'
import { useProjectGit } from './useProjectGit'
import { useT } from '../i18n'

interface ProjectTreeProps {
  projects: ProjectItemData[]
  sessions: SessionRecord[]
  activeProjectId?: string
  activeSessionId?: string
  workingSessionId?: string | null
  activeModelId?: string | null
  activeProviderId?: string
  expandedIds: ReadonlySet<string>
  onSelectProject: (projectId: string) => void
  onToggleProject: (projectId: string) => void
  onSelectSession: (sessionId: string, projectId?: string) => void
  onNewSession: (projectId: string) => void
  onRenameSession: (sessionId: string, title: string) => void
  onDeleteSession: (sessionId: string) => void
  onDeleteProject: (projectId: string) => void
}

interface ProjectNodeItemProps {
  project: ProjectItemData
  sessions: SessionRecord[]
  activeProjectId?: string
  activeSessionId?: string
  workingSessionId?: string | null
  activeModelId?: string | null
  activeProviderId?: string
  isExpanded: boolean
  onSelectProject: (projectId: string) => void
  onToggleProject: (projectId: string) => void
  onSelectSession: (sessionId: string, projectId?: string) => void
  onNewSession: (projectId: string) => void
  onRenameSession: (sessionId: string, title: string) => void
  onDeleteSession: (sessionId: string) => void
  onDeleteProject: (projectId: string) => void
}

function ProjectNodeItem({
  project,
  sessions,
  activeProjectId,
  activeSessionId,
  workingSessionId,
  activeModelId,
  activeProviderId,
  isExpanded,
  onSelectProject,
  onToggleProject,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  onDeleteProject
}: ProjectNodeItemProps): React.JSX.Element {
  const t = useT()
  const gitInfo = useProjectGit(project.path)
  const gitBranch = gitInfo.isRepo ? gitInfo.branch : null

  const projectSessions = sessions
    .filter((s) => s.projectId === project.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const isProjectActive = project.id === activeProjectId

  return (
    <ProjectRow
      name={project.name}
      path={project.path}
      gitBranch={gitBranch}
      isActive={isProjectActive}
      isExpanded={isExpanded}
      onSelect={() => onSelectProject(project.id)}
      onToggle={() => onToggleProject(project.id)}
      onNewSession={() => onNewSession(project.id)}
      onDelete={() => onDeleteProject(project.id)}
    >
      <div
        className={`session-list ${isExpanded ? 'open' : ''}`}
        aria-hidden={!isExpanded}
      >
        <div className="session-list-inner">
          <div className="session-list-body">
            {projectSessions.length === 0 ? (
              <div className="session-empty">{t('sidebar.noSessions')}</div>
            ) : (
              projectSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  isActive={isProjectActive && session.id === activeSessionId}
                  isWorking={workingSessionId === session.id}
                  gitBranch={gitBranch}
                  fallbackModelId={activeModelId}
                  fallbackProviderId={activeProviderId}
                  onSelect={() => onSelectSession(session.id, project.id)}
                  onRename={(title) => onRenameSession(session.id, title)}
                  onDelete={() => onDeleteSession(session.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </ProjectRow>
  )
}

export function ProjectTree({
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
  workingSessionId,
  activeModelId,
  activeProviderId,
  expandedIds,
  onSelectProject,
  onToggleProject,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  onDeleteProject
}: ProjectTreeProps): React.JSX.Element {
  return (
    <div className="project-tree">
      {projects.map((project) => (
        <ProjectNodeItem
          key={project.id}
          project={project}
          sessions={sessions}
          activeProjectId={activeProjectId}
          activeSessionId={activeSessionId}
          workingSessionId={workingSessionId}
          activeModelId={activeModelId}
          activeProviderId={activeProviderId}
          isExpanded={expandedIds.has(project.id)}
          onSelectProject={onSelectProject}
          onToggleProject={onToggleProject}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
          onRenameSession={onRenameSession}
          onDeleteSession={onDeleteSession}
          onDeleteProject={onDeleteProject}
        />
      ))}
    </div>
  )
}
