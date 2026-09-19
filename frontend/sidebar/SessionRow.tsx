import React, { useEffect, useRef, useState } from 'react'
import { GitBranch, Pencil, Trash2 } from 'lucide-react'
import type { SessionRecord } from './types'
import { DEFAULT_SESSION_TITLE } from './sessionStore'
import { formatRelativeTime } from './formatTime'
import { formatModelName } from './formatModel'
import { ProviderLogo } from '../providers'
import { useT } from '../i18n'

export interface SessionRowProps {
  session: SessionRecord
  isActive: boolean
  isWorking?: boolean
  gitBranch?: string | null
  fallbackModelId?: string | null
  fallbackProviderId?: string
  catalogModelName?: string
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

export function SessionRow({
  session,
  isActive,
  isWorking = false,
  gitBranch = null,
  fallbackModelId = null,
  fallbackProviderId = 'openai-codex',
  catalogModelName,
  onSelect,
  onRename,
  onDelete
}: SessionRowProps): React.JSX.Element {
  const t = useT()
  const displayed = session.title === DEFAULT_SESSION_TITLE ? t('sidebar.newChat') : session.title
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(displayed)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelBlurRef = useRef(false)

  const effectiveModelId = session.model || fallbackModelId || undefined
  const effectiveProviderId = session.providerId || fallbackProviderId
  const modelName = formatModelName(effectiveModelId, catalogModelName)
  const timeAgo = formatRelativeTime(session.updatedAt)

  useEffect(() => {
    if (!isRenaming) setDraftTitle(displayed)
  }, [displayed, isRenaming])

  useEffect(() => {
    if (!isRenaming) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isRenaming])

  const startRename = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    cancelBlurRef.current = false
    setDraftTitle(displayed)
    setIsRenaming(true)
  }

  const commitRename = (): void => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false
      return
    }
    const next = draftTitle.trim()
    const stored =
      next === '' || next === DEFAULT_SESSION_TITLE || next === t('sidebar.newChat')
        ? DEFAULT_SESSION_TITLE
        : next
    onRename(stored)
    setIsRenaming(false)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelBlurRef.current = true
      setDraftTitle(displayed)
      setIsRenaming(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isRenaming) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    onDelete()
  }

  return (
    <div
      className={`session-row ${isActive ? 'active' : ''} ${isWorking ? 'working' : ''} ${isRenaming ? 'renaming' : ''}`}
      onClick={() => {
        if (!isRenaming) {
          onSelect()
        }
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isActive}
      title={displayed}
    >
      {/* One line: working dot, title, provider mark + model, hover actions */}
      <div className="session-row-top">
        {isWorking && (
          <span
            className="session-status-dot working"
            title="Working…"
            aria-label="Working"
          />
        )}

        {isRenaming ? (
          <input
            ref={inputRef}
            className="session-rename-input"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleInputKeyDown}
            onBlur={commitRename}
            aria-label={t('sidebar.rename', { title: displayed })}
            maxLength={80}
          />
        ) : (
          <>
            <span className="session-row-title">{displayed}</span>
          </>
        )}

        <span className="session-row-actions">
          {!isRenaming && (
            <button
              type="button"
              className="sidebar-row-action"
              onClick={startRename}
              aria-label={t('sidebar.rename', { title: displayed })}
              title={t('sidebar.renameTitle')}
            >
              <Pencil size={11} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            className="sidebar-row-action sidebar-row-delete"
            onClick={handleDelete}
            aria-label={t('sidebar.delete', { title: displayed })}
            title={t('sidebar.deleteTitle')}
          >
            <Trash2 size={11} strokeWidth={2} />
          </button>
        </span>
      </div>

      {/* Second line: model mark + name, then git branch & time on the right */}
      <div className="session-row-meta">
        <div className="session-meta-left">
          <ProviderLogo providerId={effectiveProviderId} size={12} />
          <span className="session-model-name" title={effectiveModelId ?? modelName}>
            {modelName}
          </span>
        </div>
        <div className="session-meta-right">
          {gitBranch && (
            <span className="session-git-badge" title={`Branch: ${gitBranch}`}>
              <GitBranch size={11} strokeWidth={1.8} />
              <span className="session-git-name">{gitBranch}</span>
            </span>
          )}
          {timeAgo && <span className="session-time-ago">{timeAgo}</span>}
        </div>
      </div>
    </div>
  )
}
