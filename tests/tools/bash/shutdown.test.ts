import { expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { killProcessTree } from '../../../backend/tools/bash/processes'

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  test.skipIf(process.platform !== 'linux')('host ' + signal + ' terminates tracked bash children', async () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./shutdown.fixture.ts', import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errors = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const exited = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    // Observe startup failures immediately rather than waiting on a readiness timer.
    void exited.catch(() => {})
    const pids: number[] = []
    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Bash child did not start: ' + errors)), 3000)
        child.once('error', reject)
        child.stderr.on('data', data => { errors += data.toString() })
        child.stdout.on('data', data => {
          output += data.toString()
          const lines = output.trim().split('\n')
          if (lines.length >= 2) { pids.push(...lines.slice(0, 2).map(Number)); resolve() }
        })
      })
      clearTimeout(timer)
      expect(pids.every(pid => Number.isSafeInteger(pid) && pid > 0)).toBe(true)
      child.kill(signal)
      expect(await exited).toBe({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[signal])
      for (const pid of pids) {
        let alive = true
        for (let attempt = 0; attempt < 50 && alive; attempt++) {
          try { const stat = await readFile('/proc/' + pid + '/stat', 'utf8'); alive = !stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z') } catch { alive = false }
          if (alive) await Bun.sleep(10)
        }
        expect(alive).toBe(false)
      }
    } finally {
      clearTimeout(timer)
      for (const pid of pids) killProcessTree(pid)
      child.kill('SIGKILL')
      await exited.catch(() => {})
    }
  })
}
