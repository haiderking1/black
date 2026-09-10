import { THEME_PREFERENCES, type AppSettings, type ThemePreference } from './types'

export const SETTINGS_STORAGE_KEY = 'black_settings_v1'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  openSidebarOnLaunch: true,
  reduceMotion: false
}

export interface SettingsStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

export function parseSettings(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_SETTINGS }
  }

  const candidate = value as Record<string, unknown>
  return {
    theme: isThemePreference(candidate['theme']) ? candidate['theme'] : DEFAULT_SETTINGS.theme,
    openSidebarOnLaunch:
      typeof candidate['openSidebarOnLaunch'] === 'boolean'
        ? candidate['openSidebarOnLaunch']
        : DEFAULT_SETTINGS.openSidebarOnLaunch,
    reduceMotion:
      typeof candidate['reduceMotion'] === 'boolean'
        ? candidate['reduceMotion']
        : DEFAULT_SETTINGS.reduceMotion
  }
}

export function readSettings(storage: SettingsStorage): AppSettings {
  try {
    const serialized = storage.getItem(SETTINGS_STORAGE_KEY)
    if (serialized === null) return { ...DEFAULT_SETTINGS }
    return parseSettings(JSON.parse(serialized))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeSettings(storage: SettingsStorage, settings: AppSettings): boolean {
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parseSettings(settings)))
    return true
  } catch {
    return false
  }
}
