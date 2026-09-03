import React, { useState, useEffect, useRef } from 'react'
import { ProjectList, type ProjectItemData } from './ProjectList'
import { DirectoryNavigator } from './DirectoryNavigator'
import './spotlight.css'

export interface SpotlightModalProps {
  isOpen: boolean
  onClose: () => void
  projects: ProjectItemData[]
  activeProjectId?: string
  onSelectProject: (project: ProjectItemData) => void
  onAddProject: (project: ProjectItemData) => void
  onRemoveProject: (id: string) => void
}

export function SpotlightModal({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onAddProject,
  onRemoveProject
}: SpotlightModalProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'projects' | 'navigator'>('projects')
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when opened
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    if (isOpen) {
      setSearchQuery('')
      // If no projects exist yet, default to navigator tab
      if (projects.length === 0) {
        setActiveTab('navigator')
      } else {
        setActiveTab('projects')
      }
      timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isOpen, projects.length])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleProjectPicked = (project: ProjectItemData) => {
    onSelectProject(project)
    onClose()
  }

  const handleProjectAdded = (project: ProjectItemData) => {
    onAddProject(project)
    onClose()
  }

  return (
    <div className="spotlight-backdrop" onClick={handleBackdropClick} role="dialog" aria-modal="true">
      <div className="spotlight-card" onClick={(e) => e.stopPropagation()}>
        {/* Top Search Header */}
        <div className="spotlight-header">
          <svg
            className="spotlight-search-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'projects'
                ? 'Search existing projects...'
                : 'Filter directories or navigate below...'
            }
          />

          <span className="spotlight-esc-badge">ESC</span>
        </div>

        {/* Tab switch */}
        <div className="spotlight-tabs">
          <button
            type="button"
            className={`spotlight-tab-btn ${activeTab === 'projects' ? 'active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span>Projects ({projects.length})</span>
          </button>

          <button
            type="button"
            className={`spotlight-tab-btn ${activeTab === 'navigator' ? 'active' : ''}`}
            onClick={() => setActiveTab('navigator')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            <span>Add Project / Browse Folders</span>
          </button>
        </div>

        {/* Body */}
        <div className="spotlight-body">
          {activeTab === 'projects' ? (
            <ProjectList
              projects={projects}
              activeProjectId={activeProjectId}
              searchTerm={searchQuery}
              onSelectProject={handleProjectPicked}
              onRemoveProject={onRemoveProject}
            />
          ) : (
            <DirectoryNavigator
              searchTerm={searchQuery}
              onAddProject={handleProjectAdded}
            />
          )}
        </div>
      </div>
    </div>
  )
}
