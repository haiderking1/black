import React from 'react'
import { FolderPlus } from 'lucide-react'
import { ProjectList } from './ProjectList'
import type { ProjectItemData } from './ProjectList'
import { useT } from '../i18n'

interface SourcesListProps {
  showLocalFolder: boolean
  searchTerm: string
  projects: readonly ProjectItemData[]
  activeProjectId?: string
  /** Row currently highlighted, -1 for none */
  selectedIndex: number
  onSelectProject: (project: ProjectItemData) => void
  onRemoveProject: (id: string) => void
  onOpenLocalFolder: () => void
  onHoverItem: (index: number) => void
  onHoverLeave: () => void
}

export function SourcesList({
  showLocalFolder,
  searchTerm,
  projects,
  activeProjectId,
  selectedIndex,
  onSelectProject,
  onRemoveProject,
  onOpenLocalFolder,
  onHoverItem,
  onHoverLeave
}: SourcesListProps): React.JSX.Element {
  const t = useT()
  const projectOffset = showLocalFolder ? 1 : 0

  return (
    <div className="sources-container">
      {showLocalFolder && (
        <>
          <div className="spotlight-section-label">{t('spotlight.sources')}</div>
          <div
            className={`source-row ${selectedIndex === 0 ? 'selected' : ''}`}
            onClick={onOpenLocalFolder}
            onMouseEnter={() => onHoverItem(0)}
            onMouseLeave={onHoverLeave}
            title={t('spotlight.browseTitle')}
          >
            <span className="source-row-icon" aria-hidden="true">
              <FolderPlus size={18} />
            </span>
            <span className="source-row-text">
              <span className="source-row-title">{t('spotlight.localFolder')}</span>
              <span className="source-row-subtitle">{t('spotlight.localFolderHint')}</span>
            </span>
          </div>
        </>
      )}

      {projects.length > 0 && <div className="spotlight-section-label">{t('spotlight.projects')}</div>}

      <ProjectList
        projects={projects}
        activeProjectId={activeProjectId}
        selectedProjectIndex={selectedIndex - projectOffset}
        onSelectProject={onSelectProject}
        onRemoveProject={onRemoveProject}
        onHoverProject={(index) => onHoverItem(index + projectOffset)}
        onHoverLeave={onHoverLeave}
      />

      {projects.length === 0 && (
        <div className="dir-nav-empty">
          {searchTerm.trim() !== '' ? t('spotlight.noMatch', { term: searchTerm.trim() }) : t('spotlight.noProjects')}
        </div>
      )}
    </div>
  )
}
