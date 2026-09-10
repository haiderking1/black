import os from 'node:os'

import { listDirectory, type DirectoryEntry, type DirectoryResult } from './navigator'
import { openDirectoryDialog } from './dialog'
import { openInFiles } from './open'

/**
 * Filesystem operations.
 *
 * These are plain functions the RPC handlers wrap in Effects. There are no IPC
 * channels here: the renderer reaches them through the RPC server, which is the
 * only boundary between the two processes.
 */

export { listDirectory, openDirectoryDialog, openInFiles }
export type { DirectoryEntry, DirectoryResult }

export function getHomeDir(): string {
  return os.homedir()
}
