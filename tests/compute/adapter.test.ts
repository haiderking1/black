import { describe, it, expect } from 'bun:test'
import { computeTool } from '../../backend/tools/compute/tool/adapter'
import { rowLabel } from '../../frontend/tools/rowLabel'

const cwd = process.cwd()
describe('black compute adapter', () => {
 it('returns the plan result through black', async () => {
  const result = await computeTool.run({ title: 'Calculate', code: 'async () => 6 * 7' }, { cwd })
  expect(result.content).toBe('42')
  expect(result.isError).toBe(false)
 })
 it('keeps plan errors marked as errors', async () => {
  const result = await computeTool.run({ title: 'Fail', code: 'async () => { throw new Error("test failure") }' }, { cwd })
  expect(result.isError).toBe(true)
  expect(result.content).toContain('test failure')
 })
 it('validates non-string code without crashing', async () => {
  const result = await computeTool.run({ title: 'Invalid', code: 42 }, { cwd })
  expect(result.isError).toBe(true)
 })
 it('reports a missing executable without hanging', async () => {
  const result = await computeTool.run({ title: 'Run missing program', code: 'async () => await system.exec({ argv: ["/nonexistent/black-compute-program"] })', timeout: 3 }, { cwd })
  expect(result.isError).toBe(true)
  expect(result.content).toContain('ENOENT')
 })
 it('cancels an active worker', async () => {
  const controller = new AbortController()
  const pending = computeTool.run({ title: 'Wait', code: 'async () => { while (true) {} }' }, { cwd, signal: controller.signal })
  controller.abort()
  expect((await pending).isError).toBe(true)
 })
 it('shows the supplied title rather than code', () => {
  expect(rowLabel({ id: 'x', name: 'compute', args: JSON.stringify({ title: 'Check the build', code: 'secret plan' }) }).verb).toBe('Check the build')
 })
})
