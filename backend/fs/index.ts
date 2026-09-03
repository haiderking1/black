import os from 'node:os'
import { ipcMain, type BrowserWindow } from 'electron'
import { listDirectory, type DirectoryEntry, type DirectoryResult } from './navigator'
import { openDirectoryDialog } from './dialog'

export { listDirectory, openDirectoryDialog }
export type { DirectoryEntry, DirectoryResult }

export function registerFsIpc(mainWindowGetter: () => BrowserWindow | null): void {
  ipcMain.handle('fs:listDirectory', async (_event, targetPath?: unknown): Promise<DirectoryResult> => {
    const safePath = typeof targetPath === 'string' ? targetPath : undefined
    return listDirectory(safePath)
  })

  ipcMain.handle('fs:openDirectoryDialog', async (): Promise<string | null> => {
    const win = mainWindowGetter()
    const validWin = win && !win.isDestroyed() ? win : null
    return openDirectoryDialog(validWin)
  })

  ipcMain.handle('fs:getHomeDir', (): string => {
    return os.homedir()
  })

  ipcMain.handle('fs:getCwd', (): string => {
    return process.cwd()
  })
}
