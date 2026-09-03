import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('blackDesktop', {
  listDirectory: (targetPath?: string) => ipcRenderer.invoke('fs:listDirectory', targetPath),
  openDirectoryDialog: () => ipcRenderer.invoke('fs:openDirectoryDialog'),
  getHomeDir: () => ipcRenderer.invoke('fs:getHomeDir'),
  getCwd: () => ipcRenderer.invoke('fs:getCwd')
})
