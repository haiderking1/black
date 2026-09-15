import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectItemData } from '../../spotlight'
import { ProjectInstructions } from './ProjectInstructions'
import './instructions.css'

function InstructionSection({ id, name, path, reportDirty }: { id: string; name: string; path?: string; reportDirty: (id: string, dirty: boolean) => void }) {
  const [visited, setVisited] = useState(false)
  const [dirty, setDirty] = useState(false)
  const onDirtyChange = useCallback((value: boolean) => { setDirty(value); reportDirty(id, value) }, [id, reportDirty])
  useEffect(() => () => reportDirty(id, false), [id, reportDirty])
  return <details className="instruction-section" onToggle={event => { if (event.currentTarget.open) setVisited(true) }}>
    <summary><span>{name}</span>{dirty && <span className="instructions-note">Unsaved</span>}{path && <span className="instruction-section-path">{path}</span>}</summary>
    <div className="instruction-section-content">
      {visited && <ProjectInstructions workingDirectory={path} onDirtyChange={onDirtyChange} />}
    </div>
  </details>
}

export function InstructionsSettings({ projects = [], onDirtyChange }: { projects?: readonly ProjectItemData[]; onDirtyChange?: (dirty: boolean) => void }) {
  const dirtySections = useRef(new Set<string>())
  const reportDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtySections.current.add(id); else dirtySections.current.delete(id)
    onDirtyChange?.(dirtySections.current.size > 0)
  }, [onDirtyChange])
  return <section className="instructions-settings">
    <header><h2>Instructions</h2></header>
    <InstructionSection id="global" name="Global" reportDirty={reportDirty} />
    {projects.map(project => <InstructionSection key={project.id + ':' + project.path} id={'project:' + project.id} name={project.name} path={project.path} reportDirty={reportDirty} />)}
    {projects.length === 0 && <p className="instructions-note">Your projects will appear here when you add them.</p>}
  </section>
}
