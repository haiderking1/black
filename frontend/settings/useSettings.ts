import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, readSettings, writeSettings } from './settingsStore'
import type { AppSettings } from './types'

export interface UseSettingsResult {
  settings: AppSettings
  updateSetting: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void
  resetSettings: () => void
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings(window.localStorage))

  useEffect(() => {
    writeSettings(window.localStorage, settings)
  }, [settings])

  useEffect(() => {
    const root = document.documentElement
    root.dataset['theme'] = settings.theme
    root.dataset['reduceMotion'] = String(settings.reduceMotion)
    root.style.colorScheme = settings.theme === 'light' ? 'light' : 'dark'
  }, [settings.reduceMotion, settings.theme])

  const updateSetting = useCallback(
    <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]): void => {
      setSettings((current) => ({ ...current, [key]: value }))
    },
    []
  )

  const resetSettings = useCallback((): void => {
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

  return { settings, updateSetting, resetSettings }
}
