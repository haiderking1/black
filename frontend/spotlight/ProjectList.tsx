import React from 'react'

export interface ProjectItemData {
  id: string
  name: string
  path: string
}

interface ProjectListProps {
  projects: ProjectItemData[]
  activeProjectId?: string
  searchTerm: string
  onSelectProject: (project: ProjectItemData) => void
  onRemoveProject: (id: string) => void
}

export function ProjectList({
  projects,
  activeProjectId,
  searchTerm,
  onSelectProject,
  onRemoveProject
}: ProjectListProps): React.JSX.Element {
  const filtered = projects.filter((p) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return p.name.toLowerCase().includes(term) || p.path.toLowerCase().includes(term)
  })

  if (filtered.length === 0) {
    return (
      <div className="dir-nav-empty">
        {searchTerm ? `No projects matching "${searchTerm}"` : 'No projects added yet. Browse folders to add one!'}
      </div>
    )
  }

  return (
    <div className="project-list-container">
      {filtered.map((proj) => {
        const isActive = proj.id === activeProjectId
        return (
          <div
            key={proj.id}
            className={`project-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelectProject(proj)}
          >
            <div className="project-item-info">
              <div className="project-icon">
                <svg
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
              </div>

              <div className="project-title-col">
                <div className="project-name">{proj.name}</div>
                <div className="project-path">{proj.path}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isActive && <span className="project-badge">Active</span>}
              <button
                type="button"
                className="dir-nav-btn"
                title="Remove project"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveProject(proj.id)
                }}
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
