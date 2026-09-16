import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react'
import { SourcesList } from './SourcesList'
import { DirectoryList } from './DirectoryList'
import type { ProjectItemData } from './ProjectList'
import { filterDirectories, filterProjects, matchesHaystack } from './filter'
import { backspaceAction, clampIndex, firstSearchIndex, isSearchTextKey, nextIndex } from './keys'
import { useDirectoryListing } from './useDirectoryListing'
import { useT } from '../i18n'
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

function keepSearchFocus(event: React.MouseEvent, input: HTMLInputElement | null): void {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('button, input, textarea, a')) return
  event.preventDefault()
  input?.focus()
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
  const t = useT()
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

  const filteredProjects = useMemo(
    () => filterProjects(projects, searchQuery),
    [projects, searchQuery],
  )

  const filteredEntries = useMemo(
    () => filterDirectories(entries, searchQuery),
    [entries, searchQuery],
  )

  const showLocalFolder = matchesHaystack(t('spotlight.localHaystack'), searchQuery)
  const sourcesItemCount = (showLocalFolder ? 1 : 0) + filteredProjects.length
  const itemCount = view === 'sources' ? sourcesItemCount : filteredEntries.length

  // What the user actually sees highlighted: hover wins, otherwise keyboard
  const activeIndex = clampIndex(hoveredIndex ?? selectedIndex, itemCount) ?? -1

  // Fresh state every time the palette opens. Layout, not paint, so a leftover
  // folder view cannot flash before the project list comes back.
  useLayoutEffect(() => {
    if (!isOpen) return
    setView('sources')
    setSearchQuery('')
    setSelectedIndex(0)
    setHoveredIndex(null)
  }, [isOpen])

  // The search field is the keyboard sink. Focus it as soon as the DOM has
  // the input, not after a timeout, or the first keystrokes go to the composer.
  useLayoutEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
  }, [isOpen, view])

  // Typing a new query highlights the first remaining row. An empty query in
  // the folder browser leaves the highlight empty so Enter still means Add.
  useLayoutEffect(() => {
    if (!isOpen) return
    if (view === 'directories' && searchQuery.trim() === '') return
    setSelectedIndex(
      view === 'sources'
        ? firstSearchIndex(searchQuery, showLocalFolder, filteredProjects.length)
        : 0,
    )
    setHoveredIndex(null)
  }, [searchQuery, view, isOpen])

  // Directory contents changed: nothing is selected until the user picks a row,
  // so Enter still adds the current folder. Skip the project list: an empty
  // path there would wipe the highlight the moment the picker opens.
  useLayoutEffect(() => {
    if (view !== 'directories') return
    setSelectedIndex(null)
    setHoveredIndex(null)
  }, [path, view])

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    const row = globalThis.document?.querySelector('.spotlight-body .selected')
    if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen, view, filteredProjects, filteredEntries])

  const openLocalFolder = (): void => {
    setSearchQuery('')
    setSelectedIndex(null)
    setHoveredIndex(null)
    setView('directories')
  }

  const backToSources = (): void => {
    setSelectedIndex(0)
    setHoveredIndex(null)
    setView('sources')
  }

  const openDirectory = (targetPath: string): void => {
    setSearchQuery('')
    navigate(targetPath)
  }

  const moveUp = (): void => {
    setSearchQuery('')
    goUp()
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
  }

  const activateRow = (targetIndex: number): void => {
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

    const entry = filteredEntries[targetIndex]
    if (entry !== undefined) {
      openDirectory(entry.path)
      return
    }
    addCurrentDirectory()
  }

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
        const delta = e.key === 'ArrowDown' ? 1 : -1
        setSelectedIndex((prev) => nextIndex(prev, delta, itemCount))
        setHoveredIndex(null)
        return
      }

      if (e.key === 'Enter') {
        if (document.activeElement instanceof HTMLButtonElement) return
        e.preventDefault()

        const targetIndex = clampIndex(hoveredIndex ?? selectedIndex, itemCount)
        if (targetIndex === null) {
          if (view === 'directories') addCurrentDirectory()
          return
        }
        activateRow(targetIndex)
        return
      }

      if (e.key === 'Backspace') {
        const fieldValue =
          e.target === inputRef.current && inputRef.current !== null
            ? inputRef.current.value
            : searchQuery
        const action = backspaceAction({
          fieldValue,
          repeat: e.repeat,
          composing: e.isComposing,
        })
        if (action === 'ignore') return
        if (action === 'edit') {
          if (e.target !== inputRef.current) {
            e.preventDefault()
            setSearchQuery((prev) => prev.slice(0, -1))
          }
          return
        }
        e.preventDefault()
        if (view === 'directories') {
          if (parentPath !== null) moveUp()
          return
        }
        onClose()
        return
      }

      if (!isSearchTextKey(e)) return
      if (e.target === inputRef.current) return
      e.preventDefault()
      inputRef.current?.focus()
      setSearchQuery((prev) => prev + e.key)
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
      <div
        className="spotlight-card"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(event) => keepSearchFocus(event, inputRef.current)}
      >
        <div className="spotlight-header">
          <button
            type="button"
            className="spotlight-back-btn"
            onClick={isDirView ? backToSources : onClose}
            aria-label={t('spotlight.back')}
            title={t('spotlight.back')}
          >
            <ArrowLeft size={18} strokeWidth={2} className="rtl-flip" />
          </button>

          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('spotlight.search')}
            aria-label={t('spotlight.search')}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />

          {isDirView ? (
            <button
              type="button"
              className="spotlight-add-btn"
              onClick={addCurrentDirectory}
              disabled={path === '' || isLoading || (error !== null && error !== '')}
              title={t('spotlight.addTitle')}
            >
              <span>{t('spotlight.add')}</span>
              <span className="spotlight-add-shortcut">Enter</span>
            </button>
          ) : null}
        </div>

        {isDirView ? (
          <div className="spotlight-path" title={path}>
            {path === '' ? '...' : prettifyPath(path, homeDir)}
          </div>
        ) : null}

        <div className="spotlight-body">
          {isDirView ? (
            <>
              <div className="spotlight-section-label">{t('spotlight.directories')}</div>
              <DirectoryList
                entries={filteredEntries}
                isLoading={isLoading || path === ''}
                error={error}
                searchTerm={searchQuery}
                selectedIndex={activeIndex}
                onNavigate={(entry) => openDirectory(entry.path)}
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

        <div className="spotlight-footer">
          <span className="spotlight-footer-group">
            <span className="spotlight-kbd" aria-hidden="true">
              <ArrowUp size={15} strokeWidth={1.75} />
            </span>
            <span className="spotlight-kbd" aria-hidden="true">
              <ArrowDown size={15} strokeWidth={1.75} />
            </span>
            <span>{t('spotlight.navigate')}</span>
          </span>

          {(!isDirView || activeIndex >= 0) && (
            <span className="spotlight-footer-group">
              <span className="spotlight-kbd">Enter</span>
              <span>{t('spotlight.select')}</span>
            </span>
          )}

          <span className="spotlight-footer-group">
            <span className="spotlight-kbd">Backspace</span>
            <span>{t('spotlight.back')}</span>
          </span>

          <span className="spotlight-footer-group">
            <span className="spotlight-kbd">Esc</span>
            <span>{t('spotlight.close')}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
