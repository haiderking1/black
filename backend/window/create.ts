import { resolve } from 'node:path'
import { BrowserWindow, shell } from 'electron'

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
      preload: resolve(__dirname, '../preload/index.cjs'),
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
    mainWindow.loadFile(resolve(__dirname, '../renderer/index.html')).catch((err) => {
      console.error('Failed to load local HTML file in production:', err)
    })
  }

  return mainWindow
}
