import * as Schema from 'effect/Schema'

import { THINKING_LEVELS } from './providers'

/**
 * Chat contracts.
 *
 * The renderer sends the conversation it wants continued and gets the model's
 * reply back. The provider key stays on the server, so nothing here carries a
 * credential.
 */

export const ChatRole = Schema.Literals(['system', 'user', 'assistant', 'tool'])
export type ChatRole = typeof ChatRole.Type

/**
 * An image travelling with a message.
 *
 * Used in both directions. A tool that read a file returns one, and a reader
 * who pasted a screenshot into the composer sends one. The shape is the same
 * either way, so it is defined once.
 */
export const ImageAttachment = Schema.Struct({
  mimeType: Schema.String,
  /** Base64, without a data url prefix. */
  data: Schema.String,
  /**
   * What the file was called.
   *
   * Never sent to a provider, which has no field for it. It travels so the
   * transcript and the preview can label the picture with the name the reader
   * recognises, rather than a generic one.
   */
  name: Schema.optional(Schema.String),
})
export type ImageAttachment = typeof ImageAttachment.Type

/** A tool the model asked to run. */
export const ToolCall = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The arguments exactly as the model wrote them, still an unparsed JSON string. */
  arguments: Schema.String,
})
export type ToolCall = typeof ToolCall.Type

export const ChatMessage = Schema.Struct({
  /**
   * Stable per turn. Compaction names a cut point by entry id, so an id that
   * changed between turns would make a cut unresolvable.
   */
  id: Schema.optional(Schema.String),
  /** UI turn owning expanded provider rounds; compaction keeps it together. */
  turnId: Schema.optional(Schema.String),
  role: ChatRole,
  content: Schema.String,
  /** Opaque reasoning replay payload from a previous assistant turn. */
  thinkingSignature: Schema.optional(Schema.String),
  /** On an assistant turn that asked for tools instead of only answering. */
  toolCalls: Schema.optional(Schema.Array(ToolCall)),
  /** On a tool turn, naming the call this is the result of. */
  toolCallId: Schema.optional(Schema.String),
  /**
   * Images sent with this turn.
   *
   * Only ever set on a user turn. A tool result is text on the wire and has
   * nowhere to put an image, so a tool that returns one is followed by a user
   * turn carrying it.
   */
  images: Schema.optional(Schema.Array(ImageAttachment)),
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
  /**
   * Identifies this turn so it can be stopped while it streams.
   *
   * Optional: a caller that never cancels does not need one. A stream started
   * without an id cannot be reached once it has begun.
   */
  requestId: Schema.optional(Schema.String),
  /**
   * Directory the turn is about, when a project is open. Reaches the model in
   * its system prompt, so it stops guessing where it is running.
   */
  workingDirectory: Schema.optional(Schema.String),
})
export type ChatCompleteInput = typeof ChatCompleteInput.Type

export const ChatContextUsageInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
  model: Schema.NonEmptyString,
  messages: Schema.Array(ChatMessage),
})
export type ChatContextUsageInput = typeof ChatContextUsageInput.Type

export const ChatContextUsageResult = Schema.Struct({
  /** What the transcript measures, by the same estimate compaction uses. */
  tokens: Schema.Int,
  /** Null when the model's window could not be read. */
  contextWindow: Schema.NullOr(Schema.Int),
})
export type ChatContextUsageResult = typeof ChatContextUsageResult.Type

export const ChatCompactInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
  model: Schema.NonEmptyString,
  messages: Schema.Array(ChatMessage),
  sessionId: Schema.optional(Schema.String),
})
export type ChatCompactInput = typeof ChatCompactInput.Type

export const ChatCompactResult = Schema.Struct({
  /** False when there was nothing worth folding, so no transcript change. */
  compacted: Schema.Boolean,
  /** Stands in for the turns it replaces. Empty when nothing was compacted. */
  summary: Schema.String,
  /** First message kept. The transcript resumes from here. */
  firstKeptMessageId: Schema.String,
  tokensBefore: Schema.Int,
  tokensAfter: Schema.Int,
})
export type ChatCompactResult = typeof ChatCompactResult.Type

export const ChatCancelInput = Schema.Struct({
  /** The id the streaming call was made under. */
  requestId: Schema.NonEmptyString,
})
export type ChatCancelInput = typeof ChatCancelInput.Type

export const ChatCancelResult = Schema.Struct({
  /** False when the turn had already finished, or was never found. */
  cancelled: Schema.Boolean,
})
export type ChatCancelResult = typeof ChatCancelResult.Type

/**
 * One event on a streamed reply.
 *
 * A stream cannot fail halfway through as an RPC error without discarding the
 * text already sent, so a failure arrives as an event instead and the caller
 * keeps whatever it already rendered.
 */
export const ChatStreamEvent = Schema.Struct({
  type: Schema.Literals([
    'text',
    'thinking',
    'done',
    'error',
    'compacted',
    'tool_calls',
    'tool_result',
  ]),
  /** Explicit provider request within this assistant turn. */
  round: Schema.optional(Schema.Int),
  thinkingSignature: Schema.optional(Schema.String),
  /** Present for 'text' and 'thinking'. */
  text: Schema.optional(Schema.String),
  /** Present for 'tool_calls': every call the model asked for this round. */
  toolCalls: Schema.optional(Schema.Array(ToolCall)),
  /** Present for 'tool_result'. */
  toolCallId: Schema.optional(Schema.String),
  toolName: Schema.optional(Schema.String),
  toolResult: Schema.optional(Schema.String),
  toolIsError: Schema.optional(Schema.Boolean),
  /** Present for 'tool_result', when a tool returned an image. */
  toolImages: Schema.optional(Schema.Array(ImageAttachment)),
  /** Present for 'tool_result', when a tool produced something for the interface only. */
  toolDetails: Schema.optional(Schema.Unknown),
  /** Present for 'done'. */
  stopReason: Schema.optional(Schema.String),
  /** Present for 'done'. */
  usage: Schema.optional(
    Schema.Struct({ input: Schema.Int, output: Schema.Int, total: Schema.Int })
  ),
  /**
   * What the model can hold, present for 'done'.
   *
   * Travels with the usage it is measured against, so a reader never divides
   * tokens for one model by the window of another.
   */
  contextWindow: Schema.optional(Schema.Int),
  /** Present for 'compacted': what the transcript measured before and after. */
  tokensBefore: Schema.optional(Schema.Int),
  tokensAfter: Schema.optional(Schema.Int),
  /** Automatic checkpoint, applied to later provider history without erasing the UI. */
  summary: Schema.optional(Schema.String),
  firstKeptMessageId: Schema.optional(Schema.String),
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
