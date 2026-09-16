import React from 'react'
import type { Workflow } from '../../../contracts/workflow'
import { useT } from '../../i18n'
import './workflow.css'

export function WorkflowSettings({ value, onChange }: { value: Workflow; onChange: (value: Workflow) => void }): React.JSX.Element {
  const t = useT()
  return <section className="settings-section" aria-labelledby="workflow-heading">
    <div className="settings-section-heading">
      <h2 id="workflow-heading">{t('workflow.heading')}</h2>
      <p>{t('workflow.hint')}</p>
    </div>
    <fieldset className="settings-workflow-options" aria-labelledby="workflow-heading">
      {([
        ['compute', 'workflow.compute', 'workflow.computeHint'],
        ['standard', 'workflow.standard', 'workflow.standardHint'],
      ] as const).map(([mode, label, description]) => <label key={mode} className={'settings-workflow-option' + (value === mode ? ' active' : '')}>
        <input type="radio" name="workflow" value={mode} checked={value === mode} onChange={() => onChange(mode)} />
        <span className="settings-row-copy"><span className="settings-row-title">{t(label)}</span><span className="settings-row-description">{t(description)}</span></span>
      </label>)}
    </fieldset>
  </section>
}
