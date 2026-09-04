import React from 'react'
import { Folder } from 'lucide-react'

export interface ProjectItemData {
  id: string
  name: string
  path: string
}

interface ProjectListProps {
  projects: ProjectItemData[]
  activeProjectId?: string
  /** Row highlighted by hover or keyboard, -1 for none */
  selectedProjectIndex: number
  onSelectProject: (project: ProjectItemData) => void
  onRemoveProject: (id: string) => void
  onHoverProject: (index: number) => void
  onHoverLeave: () => void
}

export function ProjectList({
  projects,
  selectedProjectIndex,
  onSelectProject,
  onHoverProject,
  onHoverLeave
}: ProjectListProps): React.JSX.Element {
  return (
    <div className="project-list-container">
      {projects.map((proj, index) => {
        return (
          <div
            key={proj.id}
            className={`project-item ${index === selectedProjectIndex ? 'selected' : ''}`}
            onClick={() => onSelectProject(proj)}
            onMouseEnter={() => onHoverProject(index)}
            onMouseLeave={onHoverLeave}
          >
            <div className="project-item-info">
              <div className="project-icon">
                <Folder size={16} />
              </div>

              <div className="project-title-col">
                <div className="project-name">{proj.name}</div>
                <div className="project-path">{proj.path}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
