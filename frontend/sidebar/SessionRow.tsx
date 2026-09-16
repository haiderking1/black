import React, { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { SessionRecord } from './types'
import { DEFAULT_SESSION_TITLE } from './sessionStore'
import { useT } from '../i18n'

interface SessionRowProps {
  session: SessionRecord
  isActive: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

export function SessionRow({
  session,
  isActive,
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

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    onDelete()
  }

  return (
    <div
      className={`session-row ${isActive ? 'active' : ''} ${isRenaming ? 'renaming' : ''}`}
      onClick={isRenaming ? undefined : onSelect}
      title={displayed}
    >
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
        <span className="session-row-title">{displayed}</span>
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
  )
}
