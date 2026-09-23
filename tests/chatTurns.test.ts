import { describe, expect, it } from 'bun:test'
import * as Effect from 'effect/Effect'

import { t } from '../frontend/i18n'
import type { ChatCompactResult } from '../contracts/chat'
import {
  compactConversation,
  decideCompact,
  decideCompactAgainstLatest
} from '../frontend/chat/turns/compact'
import {
  dismissSend,
  enqueueSend,
  steerSend,
  takeNextSend,
  type QueuedSend
} from '../frontend/chat/turns/queue'
import { buildRetrySend, capturedWorkingDirectory, retryImages, retryRoute } from '../frontend/chat/turns/retry'
import type { RouteStorage } from '../frontend/composer/routing/storage'
import type { Message } from '../frontend/chat/types'

function emptyRoutes(): RouteStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    }
  }
}

function send(requestId: string, content = requestId): QueuedSend {
  return {
    requestId,
    sessionId: 'session',
    messageId: `msg-${requestId}`,
    content,
    options: undefined,
    providerId: 'opencode-go',
    images: []
  }
}

function message(id: string, role: Message['role'] = 'user', content = id): Message {
  return { id, role, content, timestamp: '00:00' }
}

describe('send queue', () => {
  it('appends waiting turns in the order they arrived', () => {
    const queued = enqueueSend(enqueueSend([], send('a')), send('b'))
    expect(queued.map((item) => item.requestId)).toEqual(['a', 'b'])
  })

  it('releases the oldest turn and leaves the rest waiting', () => {
    const drained = takeNextSend([send('a'), send('b')])
    expect(drained?.next.requestId).toBe('a')
    expect(drained?.rest.map((item) => item.requestId)).toEqual(['b'])
    expect(takeNextSend([])).toBeUndefined()
  })

  it('removes a waiting turn and names the message that must leave the transcript', () => {
    const dismissed = dismissSend([send('a'), send('b')], 'b')
    expect(dismissed?.removed.messageId).toBe('msg-b')
    expect(dismissed?.rest.map((item) => item.requestId)).toEqual(['a'])
    expect(dismissSend([send('a')], 'missing')).toBeUndefined()
  })

  it('moves a waiting turn to the front without duplicating it', () => {
    const steered = steerSend([send('a'), send('b'), send('c')], 'c')
    expect(steered?.map((item) => item.requestId)).toEqual(['c', 'a', 'b'])
    expect(steerSend([send('a')], 'missing')).toBeUndefined()
    expect(steerSend([send('only')], 'only')?.map((item) => item.requestId)).toEqual(['only'])
  })
})

describe('compaction transcript', () => {
  const history = [message('u1'), message('a1', 'assistant'), message('u2'), message('a2', 'assistant')]

  it('leaves the transcript alone when the server had nothing to fold', () => {
    expect(decideCompact(history, { compacted: false, firstKeptMessageId: 'u2', summary: '' })).toEqual({
      action: 'notice'
    })
  })

  it('keeps from the named cut and carries the summary', () => {
    expect(decideCompact(history, { compacted: true, firstKeptMessageId: 'u2', summary: 'older work' })).toEqual({
      action: 'replace',
      kept: [history[2]!, history[3]!],
      summary: 'older work'
    })
  })

  it('fails closed when the cut point has disappeared', () => {
    expect(decideCompact(history, { compacted: true, firstKeptMessageId: 'gone', summary: 'x' })).toEqual({
      action: 'cutGone'
    })
  })

  it('rebases the kept tail over messages appended while compacting', () => {
    const latest = [...history, message('u3'), message('u4')]
    expect(decideCompactAgainstLatest(history, latest, {
      compacted: true,
      firstKeptMessageId: 'u2',
      summary: 'older work'
    })).toEqual({
      action: 'replace',
      kept: latest.slice(2),
      summary: 'older work'
    })
  })

  it('does not call the server for an empty conversation', async () => {
    let called = false
    await compactConversation({
      client: {
        'chat.compact': () => {
          called = true
          return Effect.succeed({
            compacted: false,
            summary: '',
            firstKeptMessageId: '',
            tokensBefore: 0,
            tokensAfter: 0
          })
        }
      },
      sessionId: 's1',
      model: 'glm',
      providerId: 'opencode-go',
      language: 'en',
      getMessages: () => [],
      appendMessage: () => {
        throw new Error('empty compact must not write')
      },
      replaceMessages: () => {
        throw new Error('empty compact must not replace')
      }
    })
    expect(called).toBe(false)
  })

  it('sends the OpenRouter route with the compact request', async () => {
    let payload: { route?: { sort?: string; only?: string } } | undefined
    await compactConversation({
      client: {
        'chat.compact': (input) => {
          payload = input
          return Effect.succeed({
            compacted: false,
            summary: '',
            firstKeptMessageId: '',
            tokensBefore: 0,
            tokensAfter: 0
          })
        }
      },
      sessionId: 's1',
      model: 'openai/gpt-5',
      providerId: 'openrouter',
      language: 'en',
      getMessages: () => history,
      appendMessage: () => undefined,
      replaceMessages: () => {
        throw new Error('notice must not replace')
      },
      routeStorage: emptyRoutes()
    })
    expect(payload?.route).toEqual({ sort: 'latency' })
  })

  it('writes the nothing-to-compact notice into the transcript', async () => {
    const appended: Message[] = []
    await compactConversation({
      client: {
        'chat.compact': () =>
          Effect.succeed({
            compacted: false,
            summary: '',
            firstKeptMessageId: '',
            tokensBefore: 0,
            tokensAfter: 0
          })
      },
      sessionId: 's1',
      model: 'glm',
      providerId: 'opencode-go',
      language: 'en',
      getMessages: () => history,
      appendMessage: (_session, msg) => {
        appended.push(msg)
      },
      replaceMessages: () => {
        throw new Error('notice must not replace')
      }
    })
    expect(appended).toHaveLength(1)
    expect(appended[0]?.role).toBe('assistant')
    expect(appended[0]?.content).toBe(t('en', 'chat.nothingToCompact'))
  })

  it('replaces the folded prefix with the summary and the kept tail', async () => {
    let replaced: Message[] | undefined
    await compactConversation({
      client: {
        'chat.compact': () =>
          Effect.succeed({
            compacted: true,
            summary: 'earlier turns',
            firstKeptMessageId: 'u2',
            tokensBefore: 80,
            tokensAfter: 20
          })
      },
      sessionId: 's1',
      model: 'glm',
      providerId: 'opencode-go',
      language: 'en',
      getMessages: () => history,
      appendMessage: () => {
        throw new Error('successful compact must replace, not append')
      },
      replaceMessages: (_session, messages) => {
        replaced = messages
      }
    })
    expect(replaced?.map((item) => item.role)).toEqual(['assistant', 'user', 'assistant'])
    expect(replaced?.[0]?.content).toBe('earlier turns')
    expect(replaced?.slice(1).map((item) => item.id)).toEqual(['u2', 'a2'])
  })

  it('keeps queued messages that arrive before the compact response', async () => {
    let latest = [...history]
    let resolveCompact: ((result: ChatCompactResult) => void) | undefined
    const result = new Promise<ChatCompactResult>((resolve) => { resolveCompact = resolve })
    let replaced: Message[] | undefined
    const compacting = compactConversation({
      client: { 'chat.compact': () => Effect.promise(() => result) },
      sessionId: 's1',
      model: 'glm',
      providerId: 'opencode-go',
      language: 'en',
      getMessages: () => latest,
      appendMessage: () => { throw new Error('successful compact must replace') },
      replaceMessages: (_session, messages) => { replaced = messages }
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    latest = [...latest, message('u3')]
    resolveCompact?.({
      compacted: true,
      summary: 'earlier turns',
      firstKeptMessageId: 'u2',
      tokensBefore: 80,
      tokensAfter: 20
    })
    await compacting
    expect(replaced?.slice(1).map((item) => item.id)).toEqual(['u2', 'a2', 'u3'])
  })

  it('keeps the conversation when the cut id is gone, in the reader language', async () => {
    const appended: Message[] = []
    await compactConversation({
      client: {
        'chat.compact': () =>
          Effect.succeed({
            compacted: true,
            summary: 'lost',
            firstKeptMessageId: 'gone',
            tokensBefore: 10,
            tokensAfter: 10
          })
      },
      sessionId: 's1',
      model: 'glm',
      providerId: 'opencode-go',
      language: 'ar',
      getMessages: () => history,
      appendMessage: (_session, msg) => {
        appended.push(msg)
      },
      replaceMessages: () => {
        throw new Error('missing cut must not replace')
      }
    })
    expect(appended[0]?.content).toBe(t('ar', 'chat.compactCutGone'))
  })

  it('surfaces a failed compact call as an assistant message', async () => {
    const appended: Message[] = []
    await compactConversation({
      client: {
        'chat.compact': () => Effect.fail(new Error('upstream refused'))
      },
      sessionId: 's1',
      model: 'glm',
      providerId: 'opencode-go',
      language: 'en',
      getMessages: () => history,
      appendMessage: (_session, msg) => {
        appended.push(msg)
      },
      replaceMessages: () => {
        throw new Error('failed compact must not replace')
      }
    })
    expect(appended[0]?.content).toBe('upstream refused')
  })

  it('skips work when the client is not connected', async () => {
    let read = false
    await compactConversation({
      client: null,
      sessionId: 's1',
      model: 'glm',
      providerId: 'opencode-go',
      language: 'en',
      getMessages: () => {
        read = true
        return history
      },
      appendMessage: () => {
        throw new Error('offline compact must not write')
      },
      replaceMessages: () => {
        throw new Error('offline compact must not replace')
      }
    })
    expect(read).toBe(false)
  })
})

describe('retry send', () => {
  const user: Message = {
    id: 'user-1',
    role: 'user',
    content: 'try again',
    timestamp: '00:00',
    images: [{ mimeType: 'image/png', data: 'abc', name: 'shot.png' }]
  }

  it('copies image bytes and drops the display name the provider never sees', () => {
    expect(retryImages(user.images)).toEqual([{ mimeType: 'image/png', data: 'abc' }])
    expect(retryImages(undefined)).toEqual([])
  })

  it('only attaches an OpenRouter route when a model is actually selected', () => {
    const routes = emptyRoutes()
    expect(retryRoute('openrouter', 'openai/gpt-5', routes)).toEqual({ sort: 'latency' })
    expect(retryRoute('openrouter', '', routes)).toBeUndefined()
    expect(retryRoute('opencode-go', 'glm', routes)).toBeUndefined()
  })

  it('uses the stored OpenRouter host instead of ambient localStorage', () => {
    const routes = emptyRoutes()
    routes.setItem('black.openrouter.route.v1:' + encodeURIComponent('openai/gpt-5'), JSON.stringify({ only: 'anthropic' }))
    expect(retryRoute('openrouter', 'openai/gpt-5', routes)).toEqual({ only: 'anthropic' })
  })

  it('rebuilds a send that points at the original user message', () => {
    const rebuilt = buildRetrySend({
      sessionId: 's1',
      user,
      model: 'glm',
      providerId: 'opencode-go',
      thinkingLevel: 'high',
      workingDirectory: '/work/black',
      routeStorage: emptyRoutes()
    })
    expect(rebuilt.sessionId).toBe('s1')
    expect(rebuilt.messageId).toBe('user-1')
    expect(rebuilt.content).toBe('try again')
    expect(rebuilt.options?.model).toBe('glm')
    expect(rebuilt.options?.thinkingLevel).toBe('high')
    expect(rebuilt.route).toBeUndefined()
    expect(rebuilt.workingDirectory).toBe('/work/black')
    expect(rebuilt.images).toEqual([{ mimeType: 'image/png', data: 'abc' }])
    expect(rebuilt.requestId).not.toBe(rebuilt.messageId)
  })

  it('omits the model when none is selected, and still sends thinking and images', () => {
    const rebuilt = buildRetrySend({
      sessionId: 's1',
      user,
      model: undefined,
      providerId: 'openrouter',
      thinkingLevel: 'max',
      workingDirectory: '',
      routeStorage: emptyRoutes()
    })
    expect(rebuilt.options?.model).toBeUndefined()
    expect(rebuilt.route).toBeUndefined()
    expect(rebuilt.workingDirectory).toBeUndefined()
    expect(rebuilt.options?.thinkingLevel).toBe('max')
    expect(rebuilt.options?.images).toEqual([{ mimeType: 'image/png', data: 'abc' }])
  })

  it('does not send an empty working directory', () => {
    expect(capturedWorkingDirectory(undefined)).toBeUndefined()
    expect(capturedWorkingDirectory('')).toBeUndefined()
    expect(capturedWorkingDirectory('/repo')).toBe('/repo')
  })
})
