// Local shell lifecycle adapted from pi's bash tool. See LICENSE.
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { getShellConfig } from './shell'
import { killProcessTree, trackProcess, untrackProcess } from './processes'
import { waitForChildProcess } from './wait'

export interface BashExecution {
  exitCode: number | null
  signal: NodeJS.Signals | null
  aborted: boolean
  timedOut: boolean
  error?: string
}
export interface BashOptions {
  cwd: string
  signal?: AbortSignal
  timeout?: number
  onData: (data: Buffer) => void
  /** Internal injection for spawn-failure tests, not a model argument. */
  shellPath?: string
}

export async function executeBash(command: string, options: BashOptions): Promise<BashExecution> {
  if (typeof command !== 'string' || !command.trim() || command.includes(String.fromCharCode(0))) throw new Error('Bash requires a non-empty command without NUL characters')
  const timeoutMs = options.timeout === undefined ? undefined : options.timeout * 1000
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)) throw new Error('Timeout must be positive and at most 2147483.647 seconds')
  if (options.signal?.aborted) return { exitCode: null, signal: null, aborted: true, timedOut: false }
  if (!(await stat(options.cwd)).isDirectory()) throw new Error('Working directory is not a directory: ' + options.cwd)
  const shell = getShellConfig(options.shellPath)
  if (options.signal?.aborted) return { exitCode: null, signal: null, aborted: true, timedOut: false }
  const fromStdin = shell.commandTransport === 'stdin'
  const child = spawn(shell.shell, fromStdin ? shell.args : [...shell.args, command], {
    cwd: options.cwd, env: { ...process.env }, detached: process.platform !== 'win32',
    stdio: [fromStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  if (child.pid !== undefined) trackProcess(child.pid)
  const force = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let termination: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  let finished = false
  let error: string | undefined
  const stop = () => {
    if (finished) return
    if (child.pid !== undefined) {
      try { killProcessTree(child.pid) } catch (reason) { error = String(reason) }
    }
    termination ??= setTimeout(() => {
      error ??= 'Child termination did not settle within 2 seconds'
      force.abort()
    }, 2000)
  }
  const fail = (reason: unknown) => { error ??= reason instanceof Error ? reason.message : String(reason); stop() }
  const onData = (data: Buffer) => { if (error === undefined) { try { options.onData(data) } catch (reason) { fail(reason) } } }
  const waiting = waitForChildProcess(child, force.signal)
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  child.stdout?.on('error', fail)
  child.stderr?.on('error', fail)
  child.stdin?.on('error', fail)
  options.signal?.addEventListener('abort', stop, { once: true })
  try {
    if (options.signal?.aborted) stop()
    if (timeoutMs !== undefined) timeout = setTimeout(() => { timedOut = true; stop() }, timeoutMs)
    if (fromStdin) child.stdin?.end(command)
    const exitCode = await waiting
    return { exitCode, signal: child.signalCode, aborted: options.signal?.aborted === true, timedOut, ...(error === undefined ? {} : { error }) }
  } finally {
    finished = true
    clearTimeout(timeout); clearTimeout(termination)
    options.signal?.removeEventListener('abort', stop)
    child.stdout?.removeListener('data', onData)
    child.stderr?.removeListener('data', onData)
    child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy()
    // Background jobs belong to this invocation, not to the next turn.
    if (child.pid !== undefined) {
      try { killProcessTree(child.pid); untrackProcess(child.pid) } catch (reason) { throw new Error('Bash child cleanup failed: ' + String(reason)) }
    }
  }
}
