import React from 'react'
import type { ProjectItemData } from '../spotlight'
import { ProjectRow } from './ProjectRow'
import { SessionRow } from './SessionRow'
import type { SessionRecord } from './types'

interface ProjectTreeProps {
  projects: ProjectItemData[]
  sessions: SessionRecord[]
  activeProjectId?: string
  activeSessionId?: string
  expandedIds: ReadonlySet<string>
  onSelectProject: (projectId: string) => void
  onToggleProject: (projectId: string) => void
  onSelectSession: (sessionId: string) => void
  onNewSession: (projectId: string) => void
  onRenameSession: (sessionId: string, title: string) => void
  onDeleteSession: (sessionId: string) => void
  onDeleteProject: (projectId: string) => void
}

export function ProjectTree({
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
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
      {projects.map((project) => {
        const projectSessions = sessions
          .filter((s) => s.projectId === project.id)
          .sort((a, b) => b.updatedAt - a.updatedAt)
        const isExpanded = expandedIds.has(project.id)
        const isProjectActive = project.id === activeProjectId

        return (
          <ProjectRow
            key={project.id}
            name={project.name}
            path={project.path}
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
                    <div className="session-empty">No sessions yet</div>
                  ) : (
                    projectSessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        isActive={isProjectActive && session.id === activeSessionId}
                        onSelect={() => onSelectSession(session.id)}
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
      })}
    </div>
  )
}
