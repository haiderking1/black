import React from 'react'
import './workspace-title.css'

interface WorkspaceTitleProps {
  projectName?: string
  sessionTitle?: string
}

export function WorkspaceTitle({ projectName, sessionTitle }: WorkspaceTitleProps): React.JSX.Element {
  const project = projectName?.trim() || 'Workspace'
  const session = sessionTitle?.trim()
  return <div className="workspace-title" title={session ? `${project} / ${session}` : project}>
    <span className="workspace-title-project">{project}</span>
    {session ? <>
      <span className="workspace-title-separator" aria-hidden="true">/</span>
      <span className="workspace-title-session">{session}</span>
    </> : null}
  </div>
}
