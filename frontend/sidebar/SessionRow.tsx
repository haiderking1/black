import React, { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { SessionRecord } from './types'

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
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(session.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelBlurRef = useRef(false)

  useEffect(() => {
    if (!isRenaming) setDraftTitle(session.title)
  }, [session.title, isRenaming])

  useEffect(() => {
    if (!isRenaming) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isRenaming])

  const startRename = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    cancelBlurRef.current = false
    setDraftTitle(session.title)
    setIsRenaming(true)
  }

  const commitRename = (): void => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false
      return
    }
    onRename(draftTitle)
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
      setDraftTitle(session.title)
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
      title={session.title}
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
          aria-label={`Rename ${session.title}`}
          maxLength={80}
        />
      ) : (
        <span className="session-row-title">{session.title}</span>
      )}

      <span className="session-row-actions">
        {!isRenaming && (
          <button
            type="button"
            className="sidebar-row-action"
            onClick={startRename}
            aria-label={`Rename ${session.title}`}
            title="Rename session"
          >
            <Pencil size={11} strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          className="sidebar-row-action sidebar-row-delete"
          onClick={handleDelete}
          aria-label={`Delete ${session.title}`}
          title="Delete session"
        >
          <Trash2 size={11} strokeWidth={2} />
        </button>
      </span>
    </div>
  )
}
