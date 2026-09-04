import React, { useEffect, useRef, useState } from 'react'
import { Folder, MoreHorizontal, SquarePen, Trash2 } from 'lucide-react'

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
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${name}`}
          title={`${isExpanded ? 'Collapse' : 'Expand'} project`}
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
              aria-label={`Project actions for ${name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Project actions"
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
                  <span>Remove project</span>
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
            aria-label={`New session in ${name}`}
            title="New session"
          >
            <SquarePen size={15} strokeWidth={1.8} />
          </button>
        </span>
      </div>

      {children}
    </div>
  )
}
