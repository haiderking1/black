import React, { useState, useEffect } from 'react'
import type { DesktopDirectoryEntry } from '../env'
import type { ProjectItemData } from './ProjectList'

interface DirectoryNavigatorProps {
  onAddProject: (project: ProjectItemData) => void
  searchTerm?: string
}

function extractFolderName(p: string): string {
  const normalized = p.replace(/[/\\]+$/, '')
  return normalized.split(/[/\\]/).filter(Boolean).pop() || p
}

export function DirectoryNavigator({
  onAddProject,
  searchTerm = ''
}: DirectoryNavigatorProps): React.JSX.Element {
  const [currentPath, setCurrentPath] = useState<string>('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<DesktopDirectoryEntry[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [homeDir, setHomeDir] = useState<string>('')
  const isMountedRef = React.useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Initialize starting path
  useEffect(() => {
    let mounted = true
    const initPath = async () => {
      try {
        if (window.blackDesktop?.getCwd) {
          const cwd = await window.blackDesktop.getCwd()
          const home = await window.blackDesktop.getHomeDir()
          if (mounted) {
            setHomeDir(home)
            setCurrentPath(cwd || home)
          }
        } else {
          if (mounted) setCurrentPath('/')
        }
      } catch {
        if (mounted) setCurrentPath('/')
      }
    }

    void initPath()
    return () => {
      mounted = false
    }
  }, [])

  // Load directory contents whenever currentPath changes
  useEffect(() => {
    if (!currentPath) return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const fetchDir = async () => {
      try {
        if (window.blackDesktop?.listDirectory) {
          const res = await window.blackDesktop.listDirectory(currentPath)
          if (!cancelled) {
            setParentPath(res.parentPath)
            if (res.error) {
              setError(res.error)
              setEntries([])
            } else {
              setEntries(res.entries.filter((e) => e.isDirectory))
            }
          }
        } else {
          if (!cancelled) {
            setParentPath(null)
            setEntries([])
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setEntries([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchDir()
    return () => {
      cancelled = true
    }
  }, [currentPath])

  const handleNavigateUp = () => {
    if (parentPath) {
      setCurrentPath(parentPath)
    }
  }

  const handleSelectNativeDialog = async () => {
    try {
      if (window.blackDesktop?.openDirectoryDialog) {
        const picked = await window.blackDesktop.openDirectoryDialog()
        if (picked && isMountedRef.current) {
          const name = extractFolderName(picked)
          onAddProject({
            id: String(Date.now()),
            name,
            path: picked
          })
        }
      }
    } catch (err) {
      console.error('Failed to open native directory dialog:', err)
    }
  }

  const handleAddCurrent = () => {
    if (!currentPath) return
    const name = extractFolderName(currentPath)
    onAddProject({
      id: String(Date.now()),
      name,
      path: currentPath
    })
  }

  // Filter directories by search term if provided
  const filteredEntries = entries.filter((e) => {
    if (!searchTerm.trim()) return true
    return e.name.toLowerCase().includes(searchTerm.toLowerCase())
  })

  return (
    <div className="dir-nav-container">
      {/* Top path bar with Parent (..) button */}
      <div className="dir-nav-topbar">
        <div className="dir-nav-path-row">
          <button
            type="button"
            className="dir-nav-btn"
            onClick={handleNavigateUp}
            disabled={!parentPath}
            title="Go to parent directory"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <span className="dir-nav-current-path" title={currentPath}>
            {currentPath}
          </span>
        </div>

        <button
          type="button"
          className="dir-nav-btn"
          onClick={handleSelectNativeDialog}
          title="Open system folder picker"
        >
          <svg
            width="15"
            height="15"
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
        </button>
      </div>

      {/* Quick Location Chips */}
      <div className="dir-nav-quick-row">
        {homeDir && (
          <button
            type="button"
            className="dir-nav-chip"
            onClick={() => setCurrentPath(homeDir)}
          >
            ~ Home
          </button>
        )}
        {homeDir && (
          <button
            type="button"
            className="dir-nav-chip"
            onClick={() => setCurrentPath(`${homeDir}/code`)}
          >
            ~/code
          </button>
        )}
        <button
          type="button"
          className="dir-nav-chip"
          onClick={() => {
            void window.blackDesktop?.getCwd().then((c) => {
              if (isMountedRef.current && c) {
                setCurrentPath(c)
              }
            })
          }}
        >
          Workspace
        </button>
      </div>

      {/* Folder list */}
      <div className="dir-nav-list">
        {isLoading ? (
          <div className="dir-nav-empty">Reading directory...</div>
        ) : error ? (
          <div className="dir-nav-empty" style={{ color: '#ef4444' }}>
            {error}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="dir-nav-empty">
            {searchTerm ? `No subfolders matching "${searchTerm}"` : 'No subdirectories found in this folder.'}
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.path}
              className="dir-nav-item"
              onClick={() => setCurrentPath(entry.path)}
            >
              <svg
                className="dir-nav-item-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>

              <span className="dir-nav-item-name">{entry.name}</span>

              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.4 }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          ))
        )}
      </div>

      {/* Footer Actions */}
      <div className="dir-nav-footer">
        <button
          type="button"
          className="dir-nav-action-btn secondary"
          onClick={handleSelectNativeDialog}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span>Browse System Folders</span>
        </button>

        <button
          type="button"
          className="dir-nav-action-btn primary"
          onClick={handleAddCurrent}
          disabled={!currentPath}
        >
          <span>Add This Directory as Project</span>
        </button>
      </div>
    </div>
  )
}
