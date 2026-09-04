/// <reference types="vite/client" />

export interface DesktopDirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
  isHidden: boolean
}

export interface DesktopDirectoryResult {
  currentPath: string
  parentPath: string | null
  entries: DesktopDirectoryEntry[]
  error?: string
}

declare global {
  interface Window {
    blackDesktop?: {
      listDirectory: (targetPath?: string) => Promise<DesktopDirectoryResult>
      openDirectoryDialog: () => Promise<string | null>
      openInFiles: (targetPath: string) => Promise<string>
      getHomeDir: () => Promise<string>
      getCwd: () => Promise<string>
    }
  }
}
