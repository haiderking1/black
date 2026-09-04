import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react'
import { SourcesList } from './SourcesList'
import { DirectoryList } from './DirectoryList'
import type { ProjectItemData } from './ProjectList'
import { useDirectoryListing } from './useDirectoryListing'
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

type SpotlightView = 'sources' | 'directories'

function extractFolderName(p: string): string {
  const normalized = p.replace(/[/\\]+$/, '')
  return normalized.split(/[/\\]/).filter(Boolean).pop() ?? p
}

function prettifyPath(p: string, homeDir: string): string {
  if (homeDir !== '' && p === homeDir) return '~/'
  if (homeDir !== '' && p.startsWith(`${homeDir}/`)) return `~${p.slice(homeDir.length)}`
  return p
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
  /** Row chosen with arrow keys, null when no keyboard selection is active */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0)
  /** Row under the pointer, null when the pointer is not on a row */
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [view, setView] = useState<SpotlightView>('sources')
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    homeDir,
    path,
    parentPath,
    entries,
    isLoading,
    error,
    navigate,
    goUp
  } = useDirectoryListing(view === 'directories')

  // What the user actually sees highlighted: hover wins, otherwise keyboard
  const activeIndex = hoveredIndex ?? selectedIndex ?? -1

  // Fresh state every time the palette opens
  useEffect(() => {
    if (!isOpen) return
    setView('sources')
    setSearchQuery('')
    setSelectedIndex(0)
    setHoveredIndex(null)
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [isOpen])

  // Keep the input focused while the sources view is showing
  useEffect(() => {
    if (!isOpen || view !== 'sources') return
    const timer = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(timer)
  }, [view, isOpen])

  const filteredProjects = useMemo(() => {
    const term = searchQuery.trim().toLowerCase()
    if (term === '') return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(term) || p.path.toLowerCase().includes(term)
    )
  }, [projects, searchQuery])

  const showLocalFolder = useMemo(() => {
    const term = searchQuery.trim().toLowerCase()
    if (term === '') return true
    return 'local folder browse a folder on disk'.includes(term)
  }, [searchQuery])

  const sourcesItemCount = (showLocalFolder ? 1 : 0) + filteredProjects.length

  // Directory contents changed: nothing is selected until the user picks a row
  useLayoutEffect(() => {
    setSelectedIndex(null)
    setHoveredIndex(null)
  }, [path])

  const openLocalFolder = (): void => {
    setSelectedIndex(null)
    setHoveredIndex(null)
    setView('directories')
  }

  const backToSources = (): void => {
    setSelectedIndex(0)
    setHoveredIndex(null)
    setView('sources')
  }

  const addCurrentDirectory = (): void => {
    if (path === '' || isLoading || (error !== null && error !== '')) return
    const name = extractFolderName(path)
    if (name === '') return
    onAddProject({ id: String(Date.now()), name, path })
    onClose()
  }

  const handleHoverItem = (index: number): void => {
    setHoveredIndex(index)
    setSelectedIndex(index)
  }

  const handleHoverLeave = (): void => {
    setHoveredIndex(null)
    setSelectedIndex(null)
  }

  // Global keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (view === 'directories') {
          backToSources()
        } else {
          onClose()
        }
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const count = view === 'sources' ? sourcesItemCount : entries.length
        if (count === 0) return
        const delta = e.key === 'ArrowDown' ? 1 : -1
        setSelectedIndex((prev) => {
          const base = prev === null ? (delta === 1 ? -1 : 0) : prev
          return Math.max(0, Math.min(base + delta, count - 1))
        })
        setHoveredIndex(null)
        return
      }

      if (e.key === 'Enter') {
        // Let a focused button (e.g. remove project) handle its own Enter
        if (document.activeElement instanceof HTMLButtonElement) return
        e.preventDefault()

        const targetIndex = hoveredIndex ?? selectedIndex
        if (targetIndex === null) return

        if (view === 'sources') {
          if (showLocalFolder && targetIndex === 0) {
            openLocalFolder()
            return
          }
          const projectIndex = targetIndex - (showLocalFolder ? 1 : 0)
          const project = filteredProjects[projectIndex]
          if (project !== undefined) {
            onSelectProject(project)
            onClose()
          }
          return
        }

        // Directory view: open the selected folder, or add the current one
        const entry = entries[targetIndex]
        if (entry !== undefined) {
          navigate(entry.path)
        } else if (path !== '' && !isLoading && (error === null || error === '')) {
          addCurrentDirectory()
        }
        return
      }

      if (e.key === 'Backspace' && view === 'directories') {
        e.preventDefault()
        if (parentPath !== null) {
          goUp()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const isDirView = view === 'directories'

  return (
    <div className="spotlight-backdrop" onClick={handleBackdropClick} role="dialog" aria-modal="true">
      <div className="spotlight-card" onClick={(e) => e.stopPropagation()}>
        {/* Header: back arrow + search input (sources) or current path (directories) */}
        <div className="spotlight-header">
          <button
            type="button"
            className="spotlight-back-btn"
            onClick={isDirView ? backToSources : onClose}
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>

          {isDirView ? (
            <span className="spotlight-path" title={path}>
              {path === '' ? '...' : prettifyPath(path, homeDir)}
            </span>
          ) : (
            <input
              ref={inputRef}
              type="text"
              className="spotlight-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
            />
          )}

          {isDirView ? (
            <button
              type="button"
              className="spotlight-add-btn"
              onClick={addCurrentDirectory}
              disabled={path === '' || isLoading || (error !== null && error !== '')}
              title="Add this directory as a project"
            >
              <span>Add</span>
              <span className="spotlight-add-shortcut">Enter</span>
            </button>
          ) : null}
        </div>

        {/* Body */}
        <div className="spotlight-body">
          {isDirView ? (
            <>
              <div className="spotlight-section-label">Directories</div>
              <DirectoryList
                entries={entries}
                isLoading={isLoading || path === ''}
                error={error}
                selectedIndex={activeIndex}
                onNavigate={(entry) => navigate(entry.path)}
                onHover={handleHoverItem}
                onHoverLeave={handleHoverLeave}
              />
            </>
          ) : (
            <SourcesList
              showLocalFolder={showLocalFolder}
              searchTerm={searchQuery}
              projects={filteredProjects}
              activeProjectId={activeProjectId}
              selectedIndex={activeIndex}
              onSelectProject={onSelectProject}
              onRemoveProject={onRemoveProject}
              onOpenLocalFolder={openLocalFolder}
              onHoverItem={handleHoverItem}
              onHoverLeave={handleHoverLeave}
            />
          )}
        </div>

        {/* Footer hints */}
        <div className="spotlight-footer">
          <span className="spotlight-footer-group">
            <span className="spotlight-kbd" aria-hidden="true">
              <ArrowUp size={15} strokeWidth={1.75} />
            </span>
            <span className="spotlight-kbd" aria-hidden="true">
              <ArrowDown size={15} strokeWidth={1.75} />
            </span>
            <span>Navigate</span>
          </span>

          {!isDirView && (
            <span className="spotlight-footer-group">
              <span className="spotlight-kbd">Enter</span>
              <span>Select</span>
            </span>
          )}

          <span className="spotlight-footer-group">
            <span className="spotlight-kbd">Backspace</span>
            <span>Back</span>
          </span>

          <span className="spotlight-footer-group">
            <span className="spotlight-kbd">Esc</span>
            <span>Close</span>
          </span>

        </div>
      </div>
    </div>
  )
}
