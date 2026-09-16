import React from 'react'
import { Folder } from 'lucide-react'
import type { DirectoryEntry } from '../../contracts/fs'
import { useT } from '../i18n'

interface DirectoryListProps {
  entries: readonly DirectoryEntry[]
  isLoading: boolean
  error: string | null
  searchTerm: string
  selectedIndex: number
  onNavigate: (entry: DirectoryEntry) => void
  onHover: (index: number) => void
  onHoverLeave: () => void
}

export function DirectoryList({
  entries,
  isLoading,
  error,
  searchTerm,
  selectedIndex,
  onNavigate,
  onHover,
  onHoverLeave
}: DirectoryListProps): React.JSX.Element {
  const t = useT()
  if (error !== null && error !== '') {
    return <div className="dir-nav-empty dir-nav-error">{error}</div>
  }

  if (entries.length === 0 && isLoading) {
    return <div className="dir-nav-loading">{t('spotlight.reading')}</div>
  }

  if (entries.length === 0) {
    const term = searchTerm.trim()
    return (
      <div className="dir-nav-empty">
        {term !== '' ? t('spotlight.noDirMatch', { term }) : t('spotlight.noSubdirs')}
      </div>
    )
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
