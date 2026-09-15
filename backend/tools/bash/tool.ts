import type { Tool } from '../types'
import { executeBash } from './runner'
import { BashOutput } from './output'

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a bash command in the project directory with pipes, redirects, and expansion. Returns combined stdout/stderr and exit status. Each call uses a fresh shell. Background children are cleaned up when the command ends. Stop kills the process group. Optional timeout is in seconds; there is no default timeout. Output retains the last 2000 lines or 50 KiB; larger output is saved to a private temporary file readable with read.',
  parameters: {
    type: 'object', properties: {
      command: { type: 'string', minLength: 1 },
      timeout: { type: 'number', exclusiveMinimum: 0, maximum: 2147483.647 },
    }, required: ['command'], additionalProperties: false,
  },
  async run(input, context) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Bash arguments must be an object')
    const args = input as Record<string, unknown>
    if (Object.keys(args).some(key => key !== 'command' && key !== 'timeout')) throw new Error('Unknown bash argument')
    if (typeof args.command !== 'string' || (args.timeout !== undefined && typeof args.timeout !== 'number')) throw new Error('Bash requires command text and an optional numeric timeout')
    const output = new BashOutput()
    let status = ''
    let isError = false
    let execution: Awaited<ReturnType<typeof executeBash>> | undefined
    try {
      execution = await executeBash(args.command, { cwd: context.cwd, signal: context.signal, timeout: args.timeout as number | undefined, onData: data => output.append(data) })
      isError = execution.aborted || execution.timedOut || execution.exitCode !== 0 || execution.error !== undefined
      status = execution.aborted ? 'Command aborted.' : execution.timedOut ? 'Command timed out.'
        : execution.error ?? (execution.signal ? 'Command terminated by ' + execution.signal : 'Exit code: ' + execution.exitCode)
      if (execution.error && !status.includes(execution.error)) status += '\n' + execution.error
    } catch (error) { isError = true; status = error instanceof Error ? error.message : String(error) }
    let result: ReturnType<BashOutput['finish']>
    try { result = output.finish() } catch (error) {
      return { content: status + '\nSaving bash output failed: ' + String(error) + '\nEarlier side effects may have occurred. Do not rerun blindly.', isError: true }
    }
    return {
      content: (result.content || '(no output)') + '\n\n' + status + (result.fullOutputPath ? '\nOutput truncated. Saved output: ' + result.fullOutputPath + '\nRead that file instead of repeating the command.' : ''),
      isError,
      details: { ...execution, ...(result.fullOutputPath ? { fullOutputPath: result.fullOutputPath } : {}) },
    }
  },
}
