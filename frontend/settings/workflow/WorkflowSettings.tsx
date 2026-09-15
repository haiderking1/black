import React from 'react'
import type { Workflow } from '../../../contracts/workflow'
import './workflow.css'

export function WorkflowSettings({ value, onChange }: { value: Workflow; onChange: (value: Workflow) => void }): React.JSX.Element {
  return <section className="settings-section" aria-labelledby="workflow-heading">
    <div className="settings-section-heading">
      <h2 id="workflow-heading">Workflow</h2>
      <p>Applies when the next turn starts, including queued turns. Running turns keep their tools.</p>
    </div>
    <fieldset className="settings-workflow-options" aria-labelledby="workflow-heading">
      {([
        ['compute', 'Compute', 'One tool. Bash, files, and web tools run inside JavaScript plans.'],
        ['standard', 'Standard', 'Direct bash, read, write, edit, glob, and grep tools.'],
      ] as const).map(([mode, label, description]) => <label key={mode} className={'settings-workflow-option' + (value === mode ? ' active' : '')}>
        <input type="radio" name="workflow" value={mode} checked={value === mode} onChange={() => onChange(mode)} />
        <span className="settings-row-copy"><span className="settings-row-title">{label}</span><span className="settings-row-description">{description}</span></span>
      </label>)}
    </fieldset>
  </section>
}
