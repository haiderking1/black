/**
 * The provider contract.
 *
 * A provider lists models and answers chat requests. Nothing here knows which
 * vendor is behind it, so adding one means implementing these two operations
 * rather than branching everywhere.
 *
 * Models are never hardcoded. A provider reads its catalog from the vendor's
 * own endpoint, so a model added upstream shows up without a code change.
 */

/** One entry from a vendor's model catalog. */
export interface ModelInfo {
  id: string
  /** Who the vendor says owns the model. */
  ownedBy: string
  /** Unix seconds the catalog entry was created. */
  created: number
}

/** A tool the model asked to run. */
export interface ToolCall {
  id: string
  name: string
  /**
   * The arguments exactly as the model wrote them: a JSON string, not yet
   * parsed. Kept unparsed because a malformed payload has to be reported back
   * to the model verbatim so it can see what it actually sent.
   */
  arguments: string
}

/** An image carried with a message. */
export interface ChatImage {
  mimeType: string
  /** Base64, without a data url prefix. */
  data: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /**
   * Images to show alongside the text.
   *
   * Only ever set on a user message. A tool result is text on the wire and
   * there is nowhere in it for an image, so a tool that returns one is followed
   * by a user message carrying it.
   */
  images?: ChatImage[]
  /**
   * Opaque replay payload from a previous assistant turn. A reasoning model
   * needs its own earlier thinking handed back or it loses the thread across
   * turns, so this travels with the message rather than being dropped.
   */
  thinkingSignature?: string
  /** On an assistant message that asked for tools instead of only answering. */
  toolCalls?: ToolCall[]
  /** On a tool message, naming the call it is the result of. */
  toolCallId?: string
}

/** One event on a streamed reply. */
export interface ChatStreamEvent {
  type: 'text' | 'thinking' | 'tool_calls' | 'tool_result' | 'done' | 'error'
  /** Present for 'text' and 'thinking'. */
  text?: string
  /** Present for 'tool_calls', emitted once the turn ends and the calls are complete. */
  toolCalls?: ToolCall[]
  /** Present for 'tool_result'. */
  toolCallId?: string
  toolName?: string
  toolResult?: string
  toolIsError?: boolean
  toolDetails?: unknown
  /** Present for 'done'. */
  stopReason?: ChatStopReason
  usage?: ChatUsage
  /** Present for 'error'. */
  message?: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  /** Cap on generated tokens. Omitted lets the vendor decide. */
  maxTokens?: number
  temperature?: number
  /**
   * Reasoning effort, in the vendor's terms. Sent as reasoning_effort, which is
   * the OpenAI-compatible parameter name. Omitted when 'off'.
   */
  reasoningEffort?: string
  /**
   * Conversation id. Gateways use it to route related turns to the same
   * upstream, so a stable value per conversation matters more than uniqueness.
   */
  sessionId?: string
  signal?: AbortSignal
  /** Tools offered to the model, in the shape the completions API expects. */
  tools?: readonly unknown[]
}

export interface ChatUsage {
  input: number
  output: number
  total: number
}

/** Why generation stopped. Mirrors the assistant message black already stores. */
export type ChatStopReason = 'stop' | 'length' | 'error' | 'aborted'

export interface ChatResult {
  text: string
  /**
   * The model's reasoning, when it reports any. Empty for models that do not
   * think out loud. Kept separate from the answer so a caller can store it the
   * way black's session entries already model thinking blocks.
   */
  thinking: string
  /**
   * Replay payload for the thinking above. Hand this back on the next turn as
   * the assistant message's thinkingSignature, or the model re-derives context
   * it already paid for.
   */
  thinkingSignature?: string
  usage: ChatUsage
  stopReason: ChatStopReason
  /** Present when stopReason is 'error'. */
  errorMessage?: string
}

/**
 * The slice of fetch a provider actually uses.
 *
 * Typing the injection point as `typeof fetch` would require the whole runtime
 * surface, including Bun's `preconnect`, which a test double has no reason to
 * implement.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * How a model lets a caller steer its reasoning.
 *
 * Models disagree badly here, and the disagreement is not cosmetic: sending an
 * effort value a model does not list is rejected, and offering levels a model
 * cannot take invites the user to pick one. So the shape is read from the
 * vendor's catalog rather than assumed.
 */
export interface ThinkingSupport {
  /** Whether the model reasons at all. */
  reasoning: boolean
  /**
   * 'effort' accepts one of `levels`; 'toggle' is on or off with no setting;
   * 'none' means it reasons but exposes no control; 'unknown' means the model is
   * unlisted and nothing should be sent for it.
   */
  kind: 'effort' | 'toggle' | 'none' | 'unknown'
  /** Effort values the model accepts, when kind is 'effort'. */
  levels: string[]
}

export interface Provider {
  id: string
  name: string
  /** The vendor's catalog, cached. */
  listModels(): Promise<ModelInfo[]>
  /**
   * Context window for a model, for deciding when to compact. Providers whose
   * catalog does not publish one resolve it elsewhere or return a safe default.
   */
  contextWindowFor(modelId: string): Promise<number>
  /**
   * Reasoning support for a model. A model the catalog does not list reports
   * 'unknown' rather than a guess, so no thinking parameter is sent for it.
   */
  thinkingFor(modelId: string): Promise<ThinkingSupport>
  /**
   * Whether a model can be shown an image. Unlisted models report false, since
   * an image sent to a model that cannot take one fails the request.
   */
  supportsImages(modelId: string): Promise<boolean>
  /** Whether a model can call tools. Unlisted models report false. */
  supportsToolCalls(modelId: string): Promise<boolean>
  /** Drop the cached catalog so the next call refetches. */
  refreshModels(): Promise<ModelInfo[]>
  chat(request: ChatRequest): Promise<ChatResult>
  /**
   * The same request, streamed. A failure arrives as an 'error' event rather
   * than a rejection, so text already delivered is not discarded.
   */
  streamChat(request: ChatRequest): AsyncGenerator<ChatStreamEvent>
}
