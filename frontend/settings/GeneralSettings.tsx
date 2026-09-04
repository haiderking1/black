import React from 'react'
import { RotateCcw } from 'lucide-react'
import type { AppSettings } from './types'

interface GeneralSettingsProps {
  settings: AppSettings
  onChange: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void
  onReset: () => void
}

interface ToggleProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

function Toggle({ checked, label, onChange }: ToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`settings-toggle ${checked ? 'active' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-thumb" />
    </button>
  )
}

export function GeneralSettings({
  settings,
  onChange,
  onReset
}: GeneralSettingsProps): React.JSX.Element {
  return (
    <div className="settings-general">
      <header className="settings-content-header">
        <span className="settings-eyebrow">Settings</span>
        <h1>General</h1>
        <p>Control how Black behaves on this device.</p>
      </header>

      <section className="settings-section" aria-labelledby="behavior-heading">
        <div className="settings-section-heading">
          <h2 id="behavior-heading">Behavior</h2>
          <p>Set the defaults used when Black starts.</p>
        </div>

        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-copy">
              <span className="settings-row-title">Open sidebar on launch</span>
              <span className="settings-row-description">
                Start new windows with the project sidebar visible.
              </span>
            </div>
            <Toggle
              checked={settings.openSidebarOnLaunch}
              label="Open sidebar on launch"
              onChange={(checked) => onChange('openSidebarOnLaunch', checked)}
            />
          </div>

          <div className="settings-card-divider" />

          <div className="settings-row">
            <div className="settings-row-copy">
              <span className="settings-row-title">Reduce motion</span>
              <span className="settings-row-description">
                Minimize interface animations and transitions.
              </span>
            </div>
            <Toggle
              checked={settings.reduceMotion}
              label="Reduce motion"
              onChange={(checked) => onChange('reduceMotion', checked)}
            />
          </div>
        </div>
      </section>

      <section className="settings-reset-section" aria-labelledby="reset-heading">
        <div>
          <h2 id="reset-heading">Reset settings</h2>
          <p>Restore every setting to its default value.</p>
        </div>
        <button type="button" className="settings-reset-button" onClick={onReset}>
          <RotateCcw size={15} aria-hidden="true" />
          <span>Reset</span>
        </button>
      </section>
    </div>
  )
}
