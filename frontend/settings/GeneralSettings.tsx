import React from 'react'
import { RotateCcw } from 'lucide-react'
import type { AppSettings } from './types'
import { LanguageSettings } from './language/LanguageSettings'
import { WorkflowSettings } from './workflow/WorkflowSettings'
import { useT } from '../i18n'

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
  const t = useT()
  return (
    <div className="settings-general">
      <header className="settings-content-header">
        <span className="settings-eyebrow">{t('settings.eyebrow')}</span>
        <h1>{t('general.title')}</h1>
        <p>{t('general.subtitle')}</p>
      </header>

      <LanguageSettings value={settings.language} onChange={(value) => onChange('language', value)} />

      <WorkflowSettings value={settings.workflow} onChange={value => onChange('workflow', value)} />

      <section className="settings-section" aria-labelledby="behavior-heading">
        <div className="settings-section-heading">
          <h2 id="behavior-heading">{t('general.behavior')}</h2>
          <p>{t('general.behaviorHint')}</p>
        </div>

        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-copy">
              <span className="settings-row-title">{t('general.openSidebar')}</span>
              <span className="settings-row-description">
                {t('general.openSidebarHint')}
              </span>
            </div>
            <Toggle
              checked={settings.openSidebarOnLaunch}
              label={t('general.openSidebar')}
              onChange={(checked) => onChange('openSidebarOnLaunch', checked)}
            />
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <span className="settings-row-title">{t('general.reduceMotion')}</span>
              <span className="settings-row-description">
                {t('general.reduceMotionHint')}
              </span>
            </div>
            <Toggle
              checked={settings.reduceMotion}
              label={t('general.reduceMotion')}
              onChange={(checked) => onChange('reduceMotion', checked)}
            />
          </div>
        </div>
      </section>

      <section className="settings-reset-section" aria-labelledby="reset-heading">
        <div>
          <h2 id="reset-heading">{t('general.reset')}</h2>
          <p>{t('general.resetHint')}</p>
        </div>
        <button type="button" className="settings-reset-button" onClick={onReset}>
          <RotateCcw size={15} aria-hidden="true" />
          <span>{t('general.resetButton')}</span>
        </button>
      </section>
    </div>
  )
}
