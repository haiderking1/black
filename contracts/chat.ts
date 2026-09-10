import * as Schema from 'effect/Schema'

import { THINKING_LEVELS } from './providers'

/**
 * Chat contracts.
 *
 * The renderer sends the conversation it wants continued and gets the model's
 * reply back. The provider key stays on the server, so nothing here carries a
 * credential.
 */

export const ChatRole = Schema.Literals(['system', 'user', 'assistant'])
export type ChatRole = typeof ChatRole.Type

export const ChatMessage = Schema.Struct({
  role: ChatRole,
  content: Schema.String,
  /** Opaque reasoning replay payload from a previous assistant turn. */
  thinkingSignature: Schema.optional(Schema.String),
})
export type ChatMessage = typeof ChatMessage.Type

/**
 * A thinking level, in the vendor's own vocabulary. Kept as a plain string
 * because vendors disagree: GLM takes low/high/max, Kimi K3 takes max alone,
 * gpt-5.6-luna includes 'none'. THINKING_LEVELS is the set offered when a
 * model's real support is unknown.
 */
export const ThinkingLevelSchema = Schema.String
export type ThinkingLevelValue = typeof ThinkingLevelSchema.Type

export const ChatCompleteInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
  model: Schema.NonEmptyString,
  messages: Schema.Array(ChatMessage),
  /** Cap on generated tokens. */
  maxTokens: Schema.optional(Schema.Int),
  /** Reasoning effort to request, when the model supports it. */
  thinkingLevel: Schema.optional(ThinkingLevelSchema),
  /**
   * Conversation this turn belongs to. Go routes on it via the
   * x-opencode-session header, and a turn without one is rejected.
   */
  sessionId: Schema.optional(Schema.String),
})
export type ChatCompleteInput = typeof ChatCompleteInput.Type

/**
 * One event on a streamed reply.
 *
 * A stream cannot fail halfway through as an RPC error without discarding the
 * text already sent, so a failure arrives as an event instead and the caller
 * keeps whatever it already rendered.
 */
export const ChatStreamEvent = Schema.Struct({
  type: Schema.Literals(['text', 'thinking', 'done', 'error']),
  /** Present for 'text' and 'thinking'. */
  text: Schema.optional(Schema.String),
  /** Present for 'done'. */
  stopReason: Schema.optional(Schema.String),
  /** Present for 'done'. */
  usage: Schema.optional(
    Schema.Struct({ input: Schema.Int, output: Schema.Int, total: Schema.Int })
  ),
  /** Present for 'error'. */
  message: Schema.optional(Schema.String),
})
export type ChatStreamEvent = typeof ChatStreamEvent.Type

export const ChatUsage = Schema.Struct({
  input: Schema.Int,
  output: Schema.Int,
  total: Schema.Int,
})
export type ChatUsage = typeof ChatUsage.Type

export const ChatCompleteResult = Schema.Struct({
  text: Schema.String,
  /** Reasoning the model reported, empty when it does not think out loud. */
  thinking: Schema.String,
  thinkingSignature: Schema.optional(Schema.String),
  usage: ChatUsage,
  /** 'stop', 'length', 'error', or 'aborted'. */
  stopReason: Schema.String,
})
export type ChatCompleteResult = typeof ChatCompleteResult.Type
