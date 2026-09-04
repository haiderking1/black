import { shell } from 'electron'

/**
 * Reveals a path in the OS file manager.
 * Returns an empty string on success, or a human-readable error message.
 */
export async function openInFiles(targetPath: unknown): Promise<string> {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    return 'Invalid path'
  }

  try {
    return await shell.openPath(targetPath)
  } catch (err: unknown) {
    return err instanceof Error ? err.message : String(err)
  }
}
