import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, shell } from 'electron'

/**
 * This module's directory.
 *
 * The main process is bundled as ESM, where __dirname does not exist. It is
 * derived from the module URL instead.
 */
const currentDir = dirname(fileURLToPath(import.meta.url))

export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 560,
    title: 'Black',
    backgroundColor: '#0c0c0c',
    darkTheme: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolve(currentDir, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(details.url).catch((err) => {
          console.error('Failed to open external URL:', err)
        })
      }
    } catch {
      // Invalid URL string, ignore
    }
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl).catch((err) => {
      console.error('Failed to load renderer URL in dev:', err)
    })
  } else {
    mainWindow.loadFile(resolve(currentDir, '../renderer/index.html')).catch((err) => {
      console.error('Failed to load local HTML file in production:', err)
    })
  }

  return mainWindow
}
