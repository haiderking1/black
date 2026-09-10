export const THEME_PREFERENCES = [
  'dark',
  'light',
  'gruvbox',
  'catppuccin-mocha',
  'rose-pine',
  'jellybeans'
] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export interface AppSettings {
  theme: ThemePreference
  openSidebarOnLaunch: boolean
  reduceMotion: boolean
  /**
   * Model last chosen in the composer, or null to fall back to whichever model
   * the provider lists first. Persisted so reopening the app keeps the choice.
   */
  selectedModelId: string | null
  /**
   * Reasoning effort chosen in the composer. A plain string because the value
   * is the vendor's own, and vendors do not share a vocabulary: GLM takes
   * low/high/max, Kimi K3 takes max alone, gpt-5.6-luna includes 'none'.
   * 'off' is the one value this app defines, meaning send nothing.
   */
  thinkingLevel: string
}
