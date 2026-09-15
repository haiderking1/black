import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { executeBash } from '../../../backend/tools/bash/runner'

let output = ''
const result = await executeBash('printf ready; sleep 30', { cwd: tmpdir(), timeout: 0.15, onData: data => { output += data.toString() } })
assert.equal(result.timedOut, true)
assert.equal(output, 'ready')
const controller = new AbortController()
const aborted = await executeBash('echo ready; sleep 30', { cwd: tmpdir(), signal: controller.signal, onData: () => controller.abort() })
assert.equal(aborted.aborted, true)
assert.equal(aborted.error, undefined)
const exited = await executeBash('sleep 30 & echo child', { cwd: tmpdir(), onData() {} })
assert.equal(exited.exitCode, 0)
console.log('Node bash lifecycle passed')
