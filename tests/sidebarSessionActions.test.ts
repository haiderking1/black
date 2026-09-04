import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_SESSION_TITLE,
  MAX_SESSION_TITLE_LENGTH,
  deriveSessionTitle,
  removeSessionById
} from '../frontend/sidebar/sessionStore'
import { removeConversationsBySessionIds } from '../frontend/chat/useConversations'
import type { Message } from '../frontend/chat'
import type { SessionRecord } from '../frontend/sidebar'

function session(id: string, projectId: string, title: string): SessionRecord {
  return {
    id,
    projectId,
    title,
    createdAt: 1,
    updatedAt: 1
  }
}

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    timestamp: '10:00'
  }
}

describe('sidebar session actions', () => {
  it('normalizes renamed titles and restores the default for blank input', () => {
    expect(deriveSessionTitle('  Release   planning \n notes  ')).toBe('Release planning notes')
    expect(deriveSessionTitle(' \n\t ')).toBe(DEFAULT_SESSION_TITLE)
  })

  it('caps long renamed titles without exceeding the stored title limit', () => {
    const renamed = deriveSessionTitle('a'.repeat(MAX_SESSION_TITLE_LENGTH + 25))

    expect(renamed).toHaveLength(MAX_SESSION_TITLE_LENGTH)
    expect(renamed.endsWith('…')).toBe(true)
  })

  it('deletes only the selected session and its conversation', () => {
    const sessions = [
      session('session-a', 'project-a', 'Keep me'),
      session('session-b', 'project-a', 'Delete me'),
      session('session-c', 'project-b', 'Other project')
    ]
    const conversations = {
      'session-a': [message('message-a', 'kept')],
      'session-b': [message('message-b', 'deleted')],
      'session-c': [message('message-c', 'also kept')]
    }

    const remainingSessions = removeSessionById(sessions, 'session-b')
    const remainingConversations = removeConversationsBySessionIds(
      conversations,
      ['session-b']
    )

    expect(remainingSessions.map((record) => record.id)).toEqual(['session-a', 'session-c'])
    expect(Object.keys(remainingConversations)).toEqual(['session-a', 'session-c'])
    expect(remainingConversations['session-a']).toEqual(conversations['session-a'])
    expect(remainingConversations['session-c']).toEqual(conversations['session-c'])
  })

  it('keeps existing state references when delete targets do not exist', () => {
    const sessions = [session('session-a', 'project-a', 'Keep me')]
    const conversations = { 'session-a': [message('message-a', 'kept')] }

    expect(removeSessionById(sessions, 'missing')).toBe(sessions)
    expect(removeConversationsBySessionIds(conversations, ['missing'])).toBe(conversations)
    expect(removeConversationsBySessionIds(conversations, [])).toBe(conversations)
  })
})
