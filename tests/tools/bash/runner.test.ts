import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executeBash } from '../../../backend/tools/bash/runner'
import { bashTool } from '../../../backend/tools/bash/tool'

async function dead(pid: number): Promise<boolean> {
  try {
    const status = await readFile('/proc/' + pid + '/stat', 'utf8')
    return status.slice(status.lastIndexOf(')') + 2).startsWith('Z')
  } catch { return true }
}

for (const mode of ['timeout', 'abort', 'background'] as const) {
  test(mode + ' cleans up the entire process group without waiting for inherited pipes', async () => {
    const controller = new AbortController()
    let output = ''
    const started = Date.now()
    const result = await executeBash(mode === 'background' ? 'sleep 30 & echo $!' : "trap '' TERM; sleep 30 & echo $!; wait", {
      cwd: tmpdir(), signal: controller.signal, timeout: mode === 'timeout' ? 0.15 : 3,
      onData: data => { output += data.toString(); if (mode === 'abort') controller.abort() },
    })
    expect(Date.now() - started).toBeLessThan(2500)
    expect(result.timedOut).toBe(mode === 'timeout')
    expect(result.aborted).toBe(mode === 'abort')
    const pid = Number(output.trim())
    expect(Number.isSafeInteger(pid) && pid > 0).toBe(true)
    for (let count = 0; count < 50 && !(await dead(pid)); count++) await Bun.sleep(10)
    expect(await dead(pid)).toBe(true)
  })
}

test('a continuously writing inherited pipe has a bounded post-exit drain', async () => {
  let output = ''
  const started = Date.now()
  const result = await executeBash('(while true; do echo tick; sleep 0.02; done) & echo parent', { cwd: tmpdir(), onData: data => { output += data.toString() } })
  expect(result.exitCode).toBe(0)
  expect(output).toContain('parent')
  expect(output).toContain('tick')
  expect(Date.now() - started).toBeLessThan(2500)
})

test('pre-abort prevents side effects and invalid cwd/spawn failures settle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'black-bash-test-'))
  try {
    const controller = new AbortController(); controller.abort()
    expect((await executeBash('touch should-not-exist', { cwd: directory, signal: controller.signal, onData() {} })).aborted).toBe(true)
    await expect(readFile(join(directory, 'should-not-exist'))).rejects.toThrow()
    await expect(executeBash('true', { cwd: join(directory, 'missing'), onData() {} })).rejects.toThrow()
    await expect(executeBash('true', { cwd: directory, shellPath: directory, onData() {} })).rejects.toThrow()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('output callback failures stop the child instead of hanging', async () => {
  const result = await executeBash('echo ready; sleep 30', { cwd: tmpdir(), onData() { throw new Error('output failure fixture') } })
  expect(result.error).toContain('output failure fixture')
})

test('bash supports redirects, pipes, cwd, nonzero exits and signals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'black-bash-test-'))
  try {
    const result = await bashTool.run({ command: "printf hello > result; cat result | tr a-z A-Z; printf error >&2; exit 7" }, { cwd: directory })
    expect(result.content).toContain('HELLO')
    expect(result.content).toContain('error')
    expect(result.content).toContain('Exit code: 7')
    expect(result.isError).toBe(true)
    expect(await readFile(join(directory, 'result'), 'utf8')).toBe('hello')
    const signaled = await bashTool.run({ command: 'kill -TERM $$' }, { cwd: directory })
    expect(signaled.isError).toBe(true)
    expect(signaled.content).toContain('SIGTERM')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

for (const timeout of [0, -1, NaN, Infinity, 2147484]) test('rejects invalid timeout ' + timeout, async () => {
  await expect(executeBash('true', { cwd: tmpdir(), timeout, onData() {} })).rejects.toThrow('Timeout')
})
