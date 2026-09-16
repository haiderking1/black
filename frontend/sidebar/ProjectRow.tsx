import React, { useEffect, useRef, useState } from 'react'
import { Folder, MoreHorizontal, SquarePen, Trash2 } from 'lucide-react'

import { useT } from '../i18n'

interface ProjectRowProps {
  name: string
  path: string
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
          className="project-folder"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-label={isExpanded ? t('sidebar.collapseProject', { name }) : t('sidebar.expandProject', { name })}
          title={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
        >
          <Folder size={18} strokeWidth={1.8} />
        </button>

        <span className="project-row-name">{name}</span>

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
              <MoreHorizontal size={15} strokeWidth={2} />
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
            <SquarePen size={15} strokeWidth={1.8} />
          </button>
        </span>
      </div>

      {children}
    </div>
  )
}
