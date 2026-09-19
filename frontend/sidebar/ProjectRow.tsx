import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, GitBranch, MoreHorizontal, SquarePen, Trash2 } from 'lucide-react'
import { useT } from '../i18n'

export interface ProjectRowProps {
  name: string
  path: string
  gitBranch?: string | null
  isActive: boolean
  isExpanded: boolean
  onSelect: () => void
  onToggle: () => void
  onNewSession: () => void
  onDelete: () => void
  children?: React.ReactNode
}

export function ProjectRow({
  name,
  path,
  gitBranch = null,
  isActive,
  isExpanded,
  onSelect,
  onToggle,
  onNewSession,
  onDelete,
  children
}: ProjectRowProps): React.JSX.Element {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <div className="project-node">
      <div
        className={`project-row ${isActive ? 'active' : ''}`}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-expanded={isExpanded}
        title={path}
      >
        <button
          type="button"
          className="project-expand-btn"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-label={isExpanded ? t('sidebar.collapseProject', { name }) : t('sidebar.expandProject', { name })}
          title={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
        >
          {isExpanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
        </button>

        <span className="project-folder-icon" aria-hidden="true">
          <Folder size={15} strokeWidth={1.8} />
        </span>

        <span className="project-row-name">{name}</span>

        {gitBranch && (
          <span className="project-git-pill" title={`Git branch: ${gitBranch}`}>
            <GitBranch size={10} strokeWidth={1.8} />
            <span>{gitBranch}</span>
          </span>
        )}
        <span className="project-row-spacer" />

        <span className="project-row-actions">
          <span className="project-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="sidebar-row-action project-more-btn"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((open) => !open)
              }}
              aria-label={t('sidebar.projectActions', { name })}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={t('sidebar.projectActionsTitle')}
            >
              <MoreHorizontal size={14} strokeWidth={2} />
            </button>

            {menuOpen && (
              <span
                className="project-action-menu"
                role="menu"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="project-action-menu-item project-action-menu-delete"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onDelete()
                  }}
                >
                  <Trash2 size={13} strokeWidth={2} />
                  <span>{t('sidebar.removeProject')}</span>
                </button>
              </span>
            )}
          </span>

          <button
            type="button"
            className="sidebar-row-action project-new-session-btn"
            onClick={(e) => {
              e.stopPropagation()
              onNewSession()
            }}
            aria-label={t('sidebar.newSessionIn', { name })}
            title={t('sidebar.newSession')}
          >
            <SquarePen size={14} strokeWidth={1.8} />
          </button>
        </span>
      </div>

      {children}
    </div>
  )
}
