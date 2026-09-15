// Process-group tracking adapted from pi. See LICENSE.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const groups = new Set<number>()
export function trackProcess(pid: number): void { groups.add(pid) }
export function untrackProcess(pid: number): void { groups.delete(pid) }

export function killProcessTree(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid child process id')
  if (process.platform === 'win32') {
    const result = spawnSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'taskkill.exe'),
      ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true, timeout: 2000 })
    if (result.error) throw result.error
    // taskkill also returns nonzero when the process has already exited.
    if (result.status !== 0) {
      try { process.kill(pid, 0) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return; throw error }
      throw new Error('Unable to terminate process tree ' + pid)
    }
    return
  }
  try { process.kill(-pid, 'SIGKILL') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    try { process.kill(pid, 'SIGKILL') } catch (fallback) {
      if ((fallback as NodeJS.ErrnoException).code !== 'ESRCH') throw fallback
    }
  }
}

export function killTrackedChildren(): void {
  for (const pid of groups) {
    try { killProcessTree(pid); groups.delete(pid) } catch (error) { console.error('Bash cleanup failed:', error) }
  }
}

/** Install once in the Electron main process, never as an import side effect. */
export function installShellShutdownHandlers(): void {
  process.once('exit', killTrackedChildren)
  for (const [signal, code] of [['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]] as const) {
    process.once(signal, () => { killTrackedChildren(); process.exit(code) })
  }
}
