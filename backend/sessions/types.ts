/**
 * Types for the session file format, version 3.
 *
 * A session is a JSONL file. The first line is a SessionHeader; every following
 * line is a SessionEntry. Entries chain through id/parentId. This
 * implementation writes linear chains (each entry points at its predecessor)
 * and never re-parents history, so there are no branches to navigate.
 */

export const CURRENT_SESSION_VERSION = 3

// ---------------------------------------------------------------------------
// Content blocks (subset of the provider wire format)
// ---------------------------------------------------------------------------

export interface TextContent {
  type: 'text'
  text: string
  /** Provider-specific replay metadata; opaque, stored verbatim. */
  textSignature?: string
}

export interface ThinkingContent {
  type: 'thinking'
  thinking: string
  /** Opaque provider reasoning payload; stored verbatim. */
  thinkingSignature?: string
  /** True when the provider redacted this thinking block. */
  redacted?: boolean
}

export interface ImageContent {
  type: 'image'
  /** base64 encoded image data */
  data: string
  /** for example "image/jpeg", "image/png" */
  mimeType: string
}

export interface ToolCall {
  type: 'toolCall'
  id: string
  name: string
  arguments: Record<string, unknown>
  /** Opaque provider signature for reusing thought context. */
  thoughtSignature?: string
  /** Namespace for calls to dynamically loaded or namespaced tools. */
  namespace?: string
}

export type ContentBlock = TextContent | ThinkingContent | ImageContent | ToolCall

/** Token accounting for one LLM call. */
export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cacheWrite1h?: number
  /** Reasoning tokens when the provider reports them; a subset of output tokens. */
  reasoning?: number
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
}

export type StopReason = 'pending' | 'stop' | 'length' | 'toolUse' | 'error' | 'aborted' | 'deferred'

/** Messages the LLM understands. */
export type Message = UserMessage | AssistantMessage | ToolResultMessage

export interface UserMessage {
  role: 'user'
  content: string | (TextContent | ImageContent)[]
  /** Unix timestamp in milliseconds */
  timestamp: number
}

export interface AssistantMessage {
  role: 'assistant'
  content: (TextContent | ThinkingContent | ToolCall)[]
  api: string
  provider: string
  model: string
  /** Concrete model reported by the provider when it differs from the requested model. */
  responseModel?: string
  /** Provider-specific response identifier when the upstream API exposes one. */
  responseId?: string
  usage: Usage
  stopReason: StopReason
  errorMessage?: string
  rawStopReason?: string
  endTurn?: boolean
  /** Unix timestamp in milliseconds */
  timestamp: number
}

export interface ToolResultMessage<TDetails = unknown> {
  role: 'toolResult'
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  details?: TDetails
  /** Usage from the tool execution itself, if available. */
  usage?: Usage
  isError: boolean
  /** Unix timestamp in milliseconds */
  timestamp: number
}

// ---------------------------------------------------------------------------
// Coding-agent message extensions
// ---------------------------------------------------------------------------

/** A shell execution captured by the UI. */
export interface BashExecutionMessage {
  role: 'bashExecution'
  command: string
  output: string
  exitCode: number | undefined
  cancelled: boolean
  truncated: boolean
  fullOutputPath?: string
  /** True for double-bang prefix commands: excluded from LLM context. */
  excludeFromContext?: boolean
  timestamp: number
}

/** Extension-injected message that participates in LLM context. */
export interface CustomMessage<TDetails = unknown> {
  role: 'custom'
  customType: string
  content: string | (TextContent | ImageContent)[]
  display: boolean
  details?: TDetails
  timestamp: number
}

export interface BranchSummaryMessage {
  role: 'branchSummary'
  summary: string
  fromId: string | null
  timestamp: number
}

export interface CompactionSummaryMessage {
  role: 'compactionSummary'
  summary: string
  tokensBefore: number
  timestamp: number
}

/** Every message kind that can appear in a session file. */
export type AgentMessage =
  | Message
  | BashExecutionMessage
  | CustomMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface SessionHeader {
  type: 'session'
  /** v1 sessions predate the version field. */
  version?: number
  id: string
  timestamp: string
  cwd: string
  parentSession?: string
}

export interface NewSessionOptions {
  id?: string
  parentSession?: string
}

export interface SessionEntryBase {
  type: string
  /** 8-char hex id, or a full uuid when the collision fallback kicked in. */
  id: string
  /** Parent entry id; null for the first entry of the chain. */
  parentId: string | null
  /** ISO timestamp */
  timestamp: string
}

export interface SessionMessageEntry extends SessionEntryBase {
  type: 'message'
  message: AgentMessage
}

export interface ThinkingLevelChangeEntry extends SessionEntryBase {
  type: 'thinking_level_change'
  thinkingLevel: string
}

export interface ModelChangeEntry extends SessionEntryBase {
  type: 'model_change'
  provider: string
  modelId: string
}

export interface CompactionEntry<TDetails = unknown> extends SessionEntryBase {
  type: 'compaction'
  summary: string
  /** First entry retained after compaction (legacy v3 field). */
  firstKeptEntryId: string
  tokensBefore: number
  /** Materialized messages kept after compaction; makes the entry a self-contained checkpoint. */
  retainedTail?: AgentMessage[]
  /** Extension-specific data. */
  details?: TDetails
  /** Usage from the LLM call(s) that generated the summary. */
  usage?: Usage
  /** True if generated by an extension rather than the agent itself. */
  fromHook?: boolean
}

export interface BranchSummaryEntry<TDetails = unknown> extends SessionEntryBase {
  type: 'branch_summary'
  fromId: string
  summary: string
  details?: TDetails
  usage?: Usage
  fromHook?: boolean
}

/** Extension state persistence. Does NOT participate in LLM context. */
export interface CustomEntry<TData = unknown> extends SessionEntryBase {
  type: 'custom'
  customType: string
  data?: TData
}

/** User-defined bookmark on an entry. An undefined label clears it. */
export interface LabelEntry extends SessionEntryBase {
  type: 'label'
  targetId: string
  label: string | undefined
}

/** Session metadata entry, for example a user-defined display name. */
export interface SessionInfoEntry extends SessionEntryBase {
  type: 'session_info'
  name?: string
}

/** Extension-injected message entry that DOES participate in LLM context. */
export interface CustomMessageEntry<TDetails = unknown> extends SessionEntryBase {
  type: 'custom_message'
  customType: string
  content: string | (TextContent | ImageContent)[]
  display: boolean
  details?: TDetails
}

export type SessionEntry =
  | SessionMessageEntry
  | ThinkingLevelChangeEntry
  | ModelChangeEntry
  | CompactionEntry
  | BranchSummaryEntry
  | CustomEntry
  | CustomMessageEntry
  | LabelEntry
  | SessionInfoEntry

/** Every line of a session file: the header plus all entries. */
export type FileEntry = SessionHeader | SessionEntry

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export interface SessionContext {
  messages: AgentMessage[]
  thinkingLevel: string
  model: { provider: string; modelId: string } | null
}

export interface SessionInfo {
  path: string
  id: string
  /** Working directory where the session was started. Empty string for old sessions. */
  cwd: string
  /** Latest user-defined display name from session_info entries. */
  name?: string
  /** Path to the parent session, if this session was forked from one. */
  parentSessionPath?: string
  created: Date
  modified: Date
  messageCount: number
  firstMessage: string
  allMessagesText: string
}

export type SessionListProgress = (loaded: number, total: number) => void
