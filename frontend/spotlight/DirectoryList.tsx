import React from 'react'
import { Folder } from 'lucide-react'
import type { DesktopDirectoryEntry } from '../env'

interface DirectoryListProps {
  entries: DesktopDirectoryEntry[]
  isLoading: boolean
  error: string | null
  selectedIndex: number
  onNavigate: (entry: DesktopDirectoryEntry) => void
  onHover: (index: number) => void
  onHoverLeave: () => void
}

export function DirectoryList({
  entries,
  isLoading,
  error,
  selectedIndex,
  onNavigate,
  onHover,
  onHoverLeave
}: DirectoryListProps): React.JSX.Element {
  if (error !== null && error !== '') {
    return <div className="dir-nav-empty dir-nav-error">{error}</div>
  }

  if (entries.length === 0 && isLoading) {
    return <div className="dir-nav-loading">Reading directory...</div>
  }

  if (entries.length === 0) {
    return <div className="dir-nav-empty">No subdirectories in this folder.</div>
  }

  // While a new directory loads, the previous rows stay visible until the
  // fresh entries arrive, so the list never collapses mid-navigation.
  return (
    <div className="dir-nav-list">
      {entries.map((entry, index) => (
        <div
          key={entry.path}
          className={`dir-nav-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onNavigate(entry)}
          onMouseEnter={() => onHover(index)}
          onMouseLeave={onHoverLeave}
          title={entry.path}
        >
          <Folder size={16} className="dir-nav-item-icon" aria-hidden="true" />
          <span className="dir-nav-item-name">{entry.name}</span>
        </div>
      ))}
    </div>
  )
}
