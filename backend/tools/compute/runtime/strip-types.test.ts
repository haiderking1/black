import { expect, test } from 'bun:test'
import { stripPlanTypes } from './strip-types.ts'

test('erases as-assertions, annotations, and return types without rewriting modern JS', () => {
  const plan = `async (): Promise<number> => {
  const files = [] as string[];
  const name: string = "ok";
  const n = files?.length ?? 1_000;
  return (name as string).length + n;
}`
  const js = stripPlanTypes(plan)
  expect(js).not.toContain(' as ')
  expect(js).not.toContain(': string')
  expect(js).not.toContain('Promise<number>')
  expect(js).toContain('?.')
  expect(js).toContain('??')
  expect(js).toContain('1_000')
  expect(js.split('\n')).toHaveLength(plan.split('\n').length)
})

test('leaves a plain JavaScript plan unchanged in meaning', () => {
  const plan = `async () => {
  const files = ["a.ts"];
  return files.length;
}`
  expect(stripPlanTypes(plan).replace(/\s+/g, ' ').trim()).toBe(plan.replace(/\s+/g, ' ').trim())
})

test('failed type-stripping still reports a syntax error', () => {
  expect(() => stripPlanTypes('async () => { const x = ; }')).toThrow(/Unexpected token/)
})
