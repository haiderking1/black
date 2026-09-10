import { expect, test } from 'bun:test'
import { workLabel } from '../frontend/working/useWorkLabel'
import { startWork } from '../frontend/working/model'

test('work timer includes the whole active turn', () => {
  expect(workLabel(startWork(1000), true, 66000)).toBe('Working for 1m 5s')
})
test('completed duration stays fixed when revisiting a turn', () => {
  const work = { ...startWork(1000), status: 'completed' as const, updatedAt: 66000, elapsedMs: 65000 }
  expect(workLabel(work, false, 999999)).toBe('Worked for 1m 5s')
})
test('saved timestamps supply a missing elapsed duration', () => {
  expect(workLabel({ ...startWork(1000), updatedAt: 9000, status: 'stopped' }, false, 999999)).toBe('Worked for 8s')
})
test('legacy work does not invent a duration', () => {
  expect(workLabel(undefined, false, 999999)).toBe('Work history')
})
