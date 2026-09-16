import React, { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Palette, Plug, SlidersHorizontal } from 'lucide-react'
import { AppearanceSettings } from './AppearanceSettings'
import { GeneralSettings } from './GeneralSettings'
import { ProvidersSettings } from './ProvidersSettings'
import { InstructionsSettings } from './instructions/InstructionsSettings'
import type { AppSettings } from './types'
import type { ProjectItemData } from '../spotlight'
import { useT } from '../i18n'
import './settings.css'

export interface SettingsPageProps {
  projects?: readonly ProjectItemData[]
  settings: AppSettings
  onChange: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void
  onReset: () => void
  onClose: () => void
}

type SettingsSection = 'general' | 'appearance' | 'providers' | 'instructions'

export function SettingsPage({
  settings,
  projects,
  onChange,
  onReset,
  onClose
}: SettingsPageProps): React.JSX.Element {
  const t = useT()
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [instructionsDirty, setInstructionsDirty] = useState(false)
  const mayLeave = useCallback(() => !instructionsDirty || window.confirm(t('settings.discardInstructions')), [instructionsDirty, t])
  const close = useCallback(() => { if (mayLeave()) onClose() }, [mayLeave, onClose])
  function selectSection(section: SettingsSection) {
    if (section !== activeSection && mayLeave()) { setInstructionsDirty(false); setActiveSection(section) }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [close])

  return (
    <div className="settings-page">
      <aside className="settings-navigation">
        <nav className="settings-navigation-list" aria-label={t('settings.navAria')}>
          <button
            type="button"
            className={`settings-navigation-item ${activeSection === 'general' ? 'active' : ''}`}
            aria-current={activeSection === 'general' ? 'page' : undefined}
            onClick={() => selectSection('general')}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>{t('settings.nav.general')}</span>
          </button>
          <button
            type="button"
            className={`settings-navigation-item ${activeSection === 'appearance' ? 'active' : ''}`}
            aria-current={activeSection === 'appearance' ? 'page' : undefined}
            onClick={() => selectSection('appearance')}
          >
            <Palette size={16} aria-hidden="true" />
            <span>{t('settings.nav.appearance')}</span>
          </button>
          <button
            type="button"
            className={`settings-navigation-item ${activeSection === 'providers' ? 'active' : ''}`}
            aria-current={activeSection === 'providers' ? 'page' : undefined}
            onClick={() => selectSection('providers')}
          >
            <Plug size={16} aria-hidden="true" />
            <span>{t('settings.nav.providers')}</span>
          </button>
          <button type="button" className={`settings-navigation-item ${activeSection === 'instructions' ? 'active' : ''}`} aria-current={activeSection === 'instructions' ? 'page' : undefined} onClick={() => selectSection('instructions')}>
            <SlidersHorizontal size={16} aria-hidden="true" /><span>{t('settings.nav.instructions')}</span>
          </button>
        </nav>

        <button type="button" className="settings-back-button" onClick={close}>
          <ArrowLeft size={17} aria-hidden="true" className="rtl-flip" />
          <span>{t('settings.back')}</span>
        </button>
      </aside>

      <main className="settings-content">
        {activeSection === 'general' ? (
          <GeneralSettings settings={settings} onChange={onChange} onReset={onReset} />
        ) : activeSection === 'appearance' ? (
          <AppearanceSettings settings={settings} onChange={onChange} />
        ) : activeSection === 'instructions' ? (
          <InstructionsSettings projects={projects} onDirtyChange={setInstructionsDirty} />
        ) : (
          <ProvidersSettings />
        )}
      </main>
    </div>
  )
}
