import React from 'react'
import { FolderPlus } from 'lucide-react'
import { ProjectList } from './ProjectList'
import type { ProjectItemData } from './ProjectList'

interface SourcesListProps {
  showLocalFolder: boolean
  searchTerm: string
  projects: ProjectItemData[]
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
  const projectOffset = showLocalFolder ? 1 : 0

  return (
    <div className="sources-container">
      {showLocalFolder && (
        <>
          <div className="spotlight-section-label">Sources</div>
          <div
            className={`source-row ${selectedIndex === 0 ? 'selected' : ''}`}
            onClick={onOpenLocalFolder}
            onMouseEnter={() => onHoverItem(0)}
            onMouseLeave={onHoverLeave}
            title="Browse folders on disk"
          >
            <span className="source-row-icon" aria-hidden="true">
              <FolderPlus size={18} />
            </span>
            <span className="source-row-text">
              <span className="source-row-title">Local folder</span>
              <span className="source-row-subtitle">Browse a folder on disk</span>
            </span>
          </div>
        </>
      )}

      {projects.length > 0 && <div className="spotlight-section-label">Projects</div>}

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
          {searchTerm.trim() !== '' ? `No projects matching "${searchTerm.trim()}"` : 'No projects yet'}
        </div>
      )}
    </div>
  )
}
