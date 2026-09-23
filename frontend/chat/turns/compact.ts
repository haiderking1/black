import * as Effect from 'effect/Effect'

import type { ChatCompactInput, ChatCompactResult } from '../../../contracts/chat'
import type { LanguagePreference } from '../../../contracts/language'
import { t } from '../../i18n'
import { describeRpcError } from '../../rpc'
import { readRoute, toChatRoute, type RouteStorage } from '../../composer/routing/storage'
import { conversationHistory } from '../../working/history'
import { createMessage, type Message } from '../types'

export type CompactDecision =
  | { action: 'notice' }
  | { action: 'cutGone' }
  | { action: 'replace'; kept: Message[]; summary: string }

export function decideCompact(
  existing: readonly Message[],
  result: Pick<ChatCompactResult, 'compacted' | 'firstKeptMessageId' | 'summary'>
): CompactDecision {
  if (!result.compacted) return { action: 'notice' }
  const cut = existing.findIndex((message) => message.id === result.firstKeptMessageId)
  if (cut === -1) return { action: 'cutGone' }
  return { action: 'replace', kept: existing.slice(cut), summary: result.summary }
}

export function decideCompactAgainstLatest(
  original: readonly Message[],
  latest: readonly Message[],
  result: Pick<ChatCompactResult, 'compacted' | 'firstKeptMessageId' | 'summary'>
): CompactDecision {
  const decision = decideCompact(original, result)
  if (decision.action !== 'replace') return decision

  const currentCut = latest.findIndex((message) => message.id === result.firstKeptMessageId)
  if (currentCut === -1) return { action: 'cutGone' }
  return { action: 'replace', kept: [...latest.slice(currentCut)], summary: decision.summary }
}

export interface CompactRpc {
  readonly 'chat.compact': (
    input: ChatCompactInput
  ) => Effect.Effect<ChatCompactResult, unknown>
}

export interface CompactConversationInput {
  client: CompactRpc | null
  sessionId: string
  model: string
  providerId: string
  language: LanguagePreference
  getMessages: (sessionId: string) => Message[]
  appendMessage: (sessionId: string, message: Message) => void
  replaceMessages: (sessionId: string, messages: Message[]) => void
  routeStorage?: RouteStorage | null
}

/**
 * Fold older turns into a checkpoint, now rather than when the window fills.
 *
 * The transcript is replaced, not just the request. Compaction only changes
 * what gets sent, so leaving the old turns on screen would mean every later
 * turn summarized the same history again at full cost.
 */
export async function compactConversation(input: CompactConversationInput): Promise<void> {
  if (input.client === null) return

  const existing = input.getMessages(input.sessionId)
  if (existing.length === 0) return

  try {
    const result = await Effect.runPromise(
      input.client['chat.compact']({
        providerId: input.providerId,
        model: input.model,
        messages: conversationHistory(existing),
        sessionId: input.sessionId,
        ...(input.providerId === 'openrouter' ? { route: toChatRoute(readRoute(input.model, input.routeStorage)) } : {})
      })
    )

    const latest = input.getMessages(input.sessionId)
    const decision = decideCompactAgainstLatest(existing, latest, result)
    if (decision.action === 'notice') {
      input.appendMessage(
        input.sessionId,
        createMessage('assistant', t(input.language, 'chat.nothingToCompact'))
      )
      return
    }
    if (decision.action === 'cutGone') {
      input.appendMessage(
        input.sessionId,
        createMessage('assistant', t(input.language, 'chat.compactCutGone'))
      )
      return
    }

    input.replaceMessages(input.sessionId, [
      createMessage('assistant', decision.summary),
      ...decision.kept
    ])
  } catch (error) {
    input.appendMessage(input.sessionId, createMessage('assistant', describeRpcError(error)))
  }
}
