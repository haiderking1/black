import { app, BrowserWindow, nativeTheme } from 'electron'
import { createWindow } from './window'
import { registerFsIpc } from './fs'

nativeTheme.themeSource = 'dark'

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  const spawnMainWindow = (): BrowserWindow => {
    const win = createWindow()
    mainWindow = win
    win.on('closed', () => {
      if (mainWindow === win) {
        mainWindow = null
      }
    })
    return win
  }

  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    registerFsIpc(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))

    spawnMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        spawnMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
