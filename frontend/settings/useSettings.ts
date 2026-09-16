import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { DEFAULT_SETTINGS, readSettings, writeSettings } from './settingsStore'
import type { AppSettings } from './types'
import { uiDir, uiLang } from '../i18n'

export interface UseSettingsResult {
  settings: AppSettings
  updateSetting: <Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]) => void
  resetSettings: () => void
}

function applyDocumentChrome(settings: AppSettings): void {
  const root = document.documentElement
  root.dataset['theme'] = settings.theme
  root.dataset['reduceMotion'] = String(settings.reduceMotion)
  root.lang = uiLang(settings.language)
  root.dir = uiDir(settings.language)
  root.style.colorScheme = settings.theme === 'light' ? 'light' : 'dark'
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const next = readSettings(window.localStorage)
    applyDocumentChrome(next)
    return next
  })

  useEffect(() => {
    writeSettings(window.localStorage, settings)
  }, [settings])

  useLayoutEffect(() => {
    applyDocumentChrome(settings)
  }, [settings.language, settings.reduceMotion, settings.theme])

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
