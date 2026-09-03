import { dialog, type BrowserWindow } from 'electron'

export async function openDirectoryDialog(targetWindow?: BrowserWindow | null): Promise<string | null> {
  const options = {
    title: 'Select Project Directory',
    properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
  }

  const result = targetWindow
    ? await dialog.showOpenDialog(targetWindow, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const selectedPath = result.filePaths[0]
  return selectedPath ?? null
}
