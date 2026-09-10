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
}
