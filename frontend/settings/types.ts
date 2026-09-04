export type ThemePreference = 'dark' | 'light' | 'gruvbox'

export interface AppSettings {
  theme: ThemePreference
  openSidebarOnLaunch: boolean
  reduceMotion: boolean
}
