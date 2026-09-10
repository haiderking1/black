import { app, BrowserWindow, nativeTheme } from 'electron'
import { buildHandlers } from './server/handlers'
import { findFreePort } from './server/port'
import { startServer, type ServerHandle } from './server/host'
import { registerServerIpc } from './server/ipc'
import { createWindow } from './window'

nativeTheme.themeSource = 'dark'

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let server: ServerHandle | null = null

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

  const windowGetter = (): BrowserWindow | null =>
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : null

  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    // The server binds before the window loads, so the renderer's first
    // connection attempt has something to reach. A failure is reported rather
    // than thrown: the window still opens and says the backend is unavailable.
    try {
      server = await startServer({
        port: await findFreePort(),
        handlers: buildHandlers({ windowGetter })
      })
    } catch (error) {
      console.error('Failed to start the RPC server:', error)
      server = null
    }

    registerServerIpc(() => (server === null ? null : server.endpoint))

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

  // The port is released on the way out, so a restart is not blocked by a
  // lingering listener.
  app.on('before-quit', (event) => {
    if (server === null) return
    const pending = server
    server = null
    event.preventDefault()
    pending.stop().finally(() => app.quit())
  })
}
