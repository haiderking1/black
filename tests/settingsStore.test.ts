import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  parseSettings,
  readSettings,
  writeSettings,
  type SettingsStorage
} from '../frontend/settings/settingsStore'
import { THEME_PREFERENCES } from '../frontend/settings/types'

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
      reduceMotion: true,
      selectedModelId: 'glm-5.3',
      thinkingLevel: 'high' as const
    }

    expect(writeSettings(storage, selectedSettings)).toBe(true)
    expect(readSettings(storage)).toEqual(selectedSettings)
  })

  it('keeps valid saved fields and repairs invalid fields independently', () => {
    const parsed = parseSettings({
      theme: 'dark',
      openSidebarOnLaunch: 'yes',
      reduceMotion: true,
      selectedModelId: 'glm-5.3',
      // Any non-empty string is valid now: levels are the vendor's vocabulary.
      thinkingLevel: 'nonsense',
      unknownFutureField: 'ignored'
    })

    expect(parsed).toEqual({
      theme: 'dark',
      openSidebarOnLaunch: DEFAULT_SETTINGS.openSidebarOnLaunch,
      reduceMotion: true,
      selectedModelId: 'glm-5.3',
      thinkingLevel: 'nonsense'
    })
  })

  it('remembers the chosen model and thinking level across a reload', () => {
    const storage = createMemoryStorage()

    // The composer used to fall back to the provider's first model on every
    // mount, so a choice was lost as soon as the component remounted.
    writeSettings(storage, { ...DEFAULT_SETTINGS, selectedModelId: 'kimi-k3', thinkingLevel: 'max' })
    const restored = readSettings(storage)

    expect(restored.selectedModelId).toBe('kimi-k3')
    expect(restored.thinkingLevel).toBe('max')
  })

  it('repairs an empty thinking level but keeps the vendor value otherwise', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, thinkingLevel: '' }).thinkingLevel).toBe(
      DEFAULT_SETTINGS.thinkingLevel
    )
    // A level this build has never heard of is still kept: the vendor owns the
    // vocabulary, so refusing unknown values would drop valid choices.
    expect(parseSettings({ ...DEFAULT_SETTINGS, thinkingLevel: 'none' }).thinkingLevel).toBe('none')
    expect(parseSettings({ ...DEFAULT_SETTINGS, thinkingLevel: 'xhigh' }).thinkingLevel).toBe('xhigh')
  })

  it('falls back to no model when the saved id is empty or not a string', () => {
    for (const saved of ['', 42, null, { id: 'x' }]) {
      const parsed = parseSettings({ ...DEFAULT_SETTINGS, selectedModelId: saved })
      expect(parsed.selectedModelId).toBe(null)
    }
  })

  it('accepts every available theme and rejects removed theme values', () => {
    const storage = createMemoryStorage()

    for (const theme of THEME_PREFERENCES) {
      const settings = { ...DEFAULT_SETTINGS, theme }
      expect(parseSettings(settings).theme).toBe(theme)
      expect(writeSettings(storage, settings)).toBe(true)
      expect(readSettings(storage).theme).toBe(theme)
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
