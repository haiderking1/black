import React from 'react'
import { Candy, Coffee, Flower2, Moon, Palette, Sun } from 'lucide-react'
import type { AppSettings, ThemePreference } from './types'
import { useT } from '../i18n'

interface AppearanceSettingsProps {
  settings: AppSettings
  onChange: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void
}

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference
  icon: typeof Moon
}> = [
  { value: 'dark', icon: Moon },
  { value: 'light', icon: Sun },
  { value: 'gruvbox', icon: Palette },
  { value: 'catppuccin-mocha', icon: Coffee },
  { value: 'rose-pine', icon: Flower2 },
  { value: 'jellybeans', icon: Candy }
]

export function AppearanceSettings({
  settings,
  onChange
}: AppearanceSettingsProps): React.JSX.Element {
  const t = useT()
  const themeLabel = (value: ThemePreference): string => {
    switch (value) {
      case 'dark':
        return t('theme.dark')
      case 'light':
        return t('theme.light')
      case 'gruvbox':
        return t('theme.gruvbox')
      case 'catppuccin-mocha':
        return t('theme.catppuccin-mocha')
      case 'rose-pine':
        return t('theme.rose-pine')
      case 'jellybeans':
        return t('theme.jellybeans')
    }
  }

  return (
    <div className="settings-appearance">
      <header className="settings-content-header">
        <span className="settings-eyebrow">{t('settings.eyebrow')}</span>
        <h1>{t('appearance.title')}</h1>
        <p>{t('appearance.subtitle')}</p>
      </header>

      <section className="settings-section" aria-labelledby="theme-heading">
        <div className="settings-section-heading">
          <h2 id="theme-heading">{t('appearance.theme')}</h2>
          <p>{t('appearance.themeHint')}</p>
        </div>

        <div className="settings-card">
          <div className="settings-row settings-row-stacked">
            <div className="settings-theme-options" role="radiogroup" aria-label={t('appearance.themeAria')}>
              {THEME_OPTIONS.map(({ value, icon: Icon }) => {
                const selected = settings.theme === value
                const label = themeLabel(value)
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
