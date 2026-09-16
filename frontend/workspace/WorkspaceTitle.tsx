import React from 'react'
import './workspace-title.css'
import { DEFAULT_SESSION_TITLE } from '../sidebar/sessionStore'
import { useT } from '../i18n'

interface WorkspaceTitleProps {
  projectName?: string
  sessionTitle?: string
}

export function WorkspaceTitle({ projectName, sessionTitle }: WorkspaceTitleProps): React.JSX.Element {
  const t = useT()
  const project = projectName?.trim() || t('workspace.fallback')
  const rawSession = sessionTitle?.trim()
  const session = rawSession === DEFAULT_SESSION_TITLE ? t('sidebar.newChat') : rawSession
  return <div className="workspace-title" title={session ? `${project} / ${session}` : project}>
    <span className="workspace-title-project">{project}</span>
    {session ? <>
      <span className="workspace-title-separator" aria-hidden="true">/</span>
      <span className="workspace-title-session">{session}</span>
    </> : null}
  </div>
}
