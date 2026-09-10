import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONFIG_DIR_NAME } from '../agentDir'
import { resolvePath } from '../paths'
import { acquireFileLock, type FileLock } from './lock'
import type { SettingsScope, SettingsStorage } from './types'

/**
 * File-backed storage: global settings live in the agent dir, project settings
 * in <project>/.black/settings.json. Reads happen under the lock when the file
 * already exists; directories are created only when a write is actually needed.
 */
export class FileSettingsStorage implements SettingsStorage {
  private readonly globalSettingsPath: string
  private readonly projectSettingsPath: string

  constructor(cwd: string, agentDir: string) {
    this.globalSettingsPath = join(resolvePath(agentDir), 'settings.json')
    this.projectSettingsPath = join(resolvePath(cwd), CONFIG_DIR_NAME, 'settings.json')
  }

  withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void {
    const path = scope === 'global' ? this.globalSettingsPath : this.projectSettingsPath
    const dir = dirname(path)

    let release: FileLock | undefined
    try {
      const fileExists = existsSync(path)
      if (fileExists) {
        release = acquireFileLock(path)
      }
      const current = fileExists ? readFileSync(path, 'utf-8') : undefined
      const next = fn(current)
      if (next !== undefined) {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        if (release === undefined) {
          release = acquireFileLock(path)
        }
        writeFileSync(path, next, 'utf-8')
      }
    } finally {
      if (release !== undefined) {
        release.release()
      }
    }
  }
}

/** No-filesystem storage used by in-memory managers and tests. */
export class InMemorySettingsStorage implements SettingsStorage {
  private global: string | undefined
  private project: string | undefined

  withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void {
    const current = scope === 'global' ? this.global : this.project
    const next = fn(current)
    if (next !== undefined) {
      if (scope === 'global') {
        this.global = next
      } else {
        this.project = next
      }
    }
  }
}
