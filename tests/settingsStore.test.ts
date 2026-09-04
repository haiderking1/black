import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  parseSettings,
  readSettings,
  writeSettings,
  type SettingsStorage
} from '../frontend/settings/settingsStore'

function createMemoryStorage(initialValue: string | null = null): SettingsStorage {
  const values = new Map<string, string>()
  if (initialValue !== null) values.set(SETTINGS_STORAGE_KEY, initialValue)

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    }
  }
}

describe('settings persistence', () => {
  it('persists and restores settings selected by the user', () => {
    const storage = createMemoryStorage()
    const selectedSettings = {
      theme: 'gruvbox' as const,
      openSidebarOnLaunch: false,
      reduceMotion: true
    }

    expect(writeSettings(storage, selectedSettings)).toBe(true)
    expect(readSettings(storage)).toEqual(selectedSettings)
  })

  it('keeps valid saved fields and repairs invalid fields independently', () => {
    const parsed = parseSettings({
      theme: 'dark',
      openSidebarOnLaunch: 'yes',
      reduceMotion: true,
      unknownFutureField: 'ignored'
    })

    expect(parsed).toEqual({
      theme: 'dark',
      openSidebarOnLaunch: DEFAULT_SETTINGS.openSidebarOnLaunch,
      reduceMotion: true
    })
  })

  it('accepts every available theme and rejects removed theme values', () => {
    for (const theme of ['dark', 'light', 'gruvbox'] as const) {
      expect(parseSettings({ ...DEFAULT_SETTINGS, theme }).theme).toBe(theme)
    }

    expect(parseSettings({ ...DEFAULT_SETTINGS, theme: 'system' }).theme).toBe(
      DEFAULT_SETTINGS.theme
    )
  })

  it('falls back to defaults when saved JSON is malformed', () => {
    const storage = createMemoryStorage('{not-valid-json')
    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS)
  })

  it('handles unavailable storage without throwing', () => {
    const unavailableStorage: SettingsStorage = {
      getItem: () => {
        throw new Error('storage unavailable')
      },
      setItem: () => {
        throw new Error('storage unavailable')
      }
    }

    expect(readSettings(unavailableStorage)).toEqual(DEFAULT_SETTINGS)
    expect(writeSettings(unavailableStorage, DEFAULT_SETTINGS)).toBe(false)
  })
})
