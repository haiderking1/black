import { THEME_PREFERENCES, type AppSettings, type ThemePreference } from './types'

export const SETTINGS_STORAGE_KEY = 'black_settings_v1'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  workflow: 'compute',
  openSidebarOnLaunch: true,
  reduceMotion: false,
  selectedModelId: null,
  selectedProviderId: null,
  selectedModels: {},
  thinkingLevel: 'medium'
}

export interface SettingsStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

/** Any non-empty string: the level is the vendor's own vocabulary. */
function isThinkingLevel(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function parseSelectedModels(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, modelId] of Object.entries(value)) {
    if (key !== '' && typeof modelId === 'string' && modelId !== '') result[key] = modelId
  }
  return result
}

export function parseSettings(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_SETTINGS }
  }

  const candidate = value as Record<string, unknown>
  return {
    theme: isThemePreference(candidate['theme']) ? candidate['theme'] : DEFAULT_SETTINGS.theme,
    workflow: candidate['workflow'] === 'standard' ? 'standard' : 'compute',
    openSidebarOnLaunch:
      typeof candidate['openSidebarOnLaunch'] === 'boolean'
        ? candidate['openSidebarOnLaunch']
        : DEFAULT_SETTINGS.openSidebarOnLaunch,
    reduceMotion:
      typeof candidate['reduceMotion'] === 'boolean'
        ? candidate['reduceMotion']
        : DEFAULT_SETTINGS.reduceMotion,
    // A model id that is no longer served resolves to null rather than pinning a
    // selection the provider cannot answer.
    selectedModelId:
      typeof candidate['selectedModelId'] === 'string' && candidate['selectedModelId'] !== ''
        ? candidate['selectedModelId']
        : DEFAULT_SETTINGS.selectedModelId,
    selectedProviderId:
      typeof candidate['selectedProviderId'] === 'string' && candidate['selectedProviderId'] !== ''
        ? candidate['selectedProviderId']
        : DEFAULT_SETTINGS.selectedProviderId,
    selectedModels: parseSelectedModels(candidate['selectedModels']),
    thinkingLevel: isThinkingLevel(candidate['thinkingLevel'])
      ? candidate['thinkingLevel']
      : DEFAULT_SETTINGS.thinkingLevel
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
