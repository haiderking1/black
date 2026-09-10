import React from 'react'
import { Candy, Coffee, Flower2, Moon, Palette, Sun } from 'lucide-react'
import type { AppSettings, ThemePreference } from './types'

interface AppearanceSettingsProps {
  settings: AppSettings
  onChange: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void
}

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference
  label: string
  icon: typeof Moon
}> = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'gruvbox', label: 'Gruvbox', icon: Palette },
  { value: 'catppuccin-mocha', label: 'Catppuccin Mocha', icon: Coffee },
  { value: 'rose-pine', label: 'Rosé Pine', icon: Flower2 },
  { value: 'jellybeans', label: 'Jellybeans', icon: Candy }
]

export function AppearanceSettings({
  settings,
  onChange
}: AppearanceSettingsProps): React.JSX.Element {
  return (
    <div className="settings-appearance">
      <header className="settings-content-header">
        <span className="settings-eyebrow">Settings</span>
        <h1>Appearance</h1>
        <p>Choose the colors used across Black.</p>
      </header>

      <section className="settings-section" aria-labelledby="theme-heading">
        <div className="settings-section-heading">
          <h2 id="theme-heading">Theme</h2>
          <p>Changes apply immediately and stay selected after restart.</p>
        </div>

        <div className="settings-card">
          <div className="settings-row settings-row-stacked">
            <div className="settings-theme-options" role="radiogroup" aria-label="Theme">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                const selected = settings.theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    className={`settings-theme-option ${selected ? 'active' : ''}`}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange('theme', value)}
                  >
                    <span
                      className="settings-theme-preview"
                      data-theme-preview={value}
                      aria-hidden="true"
                    >
                      <span className="settings-theme-preview-sidebar" />
                      <span className="settings-theme-preview-content">
                        <span />
                        <span />
                      </span>
                    </span>

                    <span className="settings-theme-option-label">
                      <Icon size={15} aria-hidden="true" />
                      <span>{label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
