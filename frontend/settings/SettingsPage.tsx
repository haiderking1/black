import React, { useEffect, useState } from 'react'
import { ArrowLeft, Palette, Plug, SlidersHorizontal } from 'lucide-react'
import { AppearanceSettings } from './AppearanceSettings'
import { GeneralSettings } from './GeneralSettings'
import { ProvidersSettings } from './ProvidersSettings'
import type { AppSettings } from './types'
import './settings.css'

export interface SettingsPageProps {
  settings: AppSettings
  onChange: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void
  onReset: () => void
  onClose: () => void
}

type SettingsSection = 'general' | 'appearance' | 'providers'

export function SettingsPage({
  settings,
  onChange,
  onReset,
  onClose
}: SettingsPageProps): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div className="settings-page">
      <aside className="settings-navigation">
        <nav className="settings-navigation-list" aria-label="Settings sections">
          <button
            type="button"
            className={`settings-navigation-item ${activeSection === 'general' ? 'active' : ''}`}
            aria-current={activeSection === 'general' ? 'page' : undefined}
            onClick={() => setActiveSection('general')}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>General</span>
          </button>
          <button
            type="button"
            className={`settings-navigation-item ${activeSection === 'appearance' ? 'active' : ''}`}
            aria-current={activeSection === 'appearance' ? 'page' : undefined}
            onClick={() => setActiveSection('appearance')}
          >
            <Palette size={16} aria-hidden="true" />
            <span>Appearance</span>
          </button>
          <button
            type="button"
            className={`settings-navigation-item ${activeSection === 'providers' ? 'active' : ''}`}
            aria-current={activeSection === 'providers' ? 'page' : undefined}
            onClick={() => setActiveSection('providers')}
          >
            <Plug size={16} aria-hidden="true" />
            <span>Providers</span>
          </button>
        </nav>

        <button type="button" className="settings-back-button" onClick={onClose}>
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Back</span>
        </button>
      </aside>

      <main className="settings-content">
        {activeSection === 'general' ? (
          <GeneralSettings settings={settings} onChange={onChange} onReset={onReset} />
        ) : activeSection === 'appearance' ? (
          <AppearanceSettings settings={settings} onChange={onChange} />
        ) : (
          <ProvidersSettings />
        )}
      </main>
    </div>
  )
}
