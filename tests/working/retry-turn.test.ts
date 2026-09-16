import { expect, test } from 'bun:test'
import { createMessage } from '../../frontend/chat/types'
import { startWork } from '../../frontend/working/model'
import { failedTurnToResend } from '../../frontend/working/retry/turn'

function failedAssistant(): ReturnType<typeof createMessage> {
  return { ...createMessage('assistant', ''), work: { ...startWork(1), status: 'failed', updatedAt: 2, error: 'Internal server error' } }
}

test('resends the user turn that the last failed assistant answered', () => {
  const user = createMessage('user', 'hi')
  const assistant = failedAssistant()
  expect(failedTurnToResend([user, assistant], assistant.id)).toEqual(user)
})

test('refuses a retry that is not the last turn, or not a dead assistant', () => {
  const user = createMessage('user', 'hi')
  const assistant = failedAssistant()
  const later = createMessage('user', 'again')
  expect(failedTurnToResend([user, assistant, later], assistant.id)).toBeUndefined()
  expect(failedTurnToResend([user, { ...assistant, work: startWork(1) }], assistant.id)).toBeUndefined()
  expect(failedTurnToResend([user], user.id)).toBeUndefined()
})

test('finds the nearest user when an interrupted assistant is last', () => {
  const first = createMessage('user', 'one')
  const middle = { ...createMessage('assistant', 'ok'), work: { ...startWork(1), status: 'completed' as const, updatedAt: 2 } }
  const second = createMessage('user', 'two')
  const dead = { ...createMessage('assistant', ''), work: { ...startWork(3), status: 'interrupted' as const, updatedAt: 4 } }
  expect(failedTurnToResend([first, middle, second, dead], dead.id)).toEqual(second)
})
