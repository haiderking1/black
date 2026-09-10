/** A JSON Schema object, shaped the way the chat completions API expects it. */
export interface JsonSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

/** An image returned by a tool, ready to be shown to a model. */
export interface ImageAttachment {
  /** Base64, without a data url prefix. */
  data: string
  mimeType: string
}

/** Everything a tool needs that is not in its arguments. */
export interface ToolContext {
  /** The directory relative paths resolve against. */
  cwd: string
  signal?: AbortSignal
  /**
   * Whether the model being asked can be shown an image.
   *
   * A tool that reads one needs to know before it decides what to return. The
   * bytes can be decoded either way, but handing them to a model that cannot
   * accept them fails the whole request rather than that one read.
   */
  acceptsImages?: boolean
}

export interface ToolOutcome {
  isError?: boolean
  /** The text that becomes the tool result the model reads on its next turn. */
  content: string
  /**
   * Images to show the model alongside that text.
   *
   * Kept separate from the content because a tool result is text on the wire.
   * These travel as their own message, which is the only place an image can go
   * in the middle of a turn.
   */
  images?: ImageAttachment[]
  /** Anything the interface wants to show beyond the text. Never sent to the model. */
  details?: Record<string, unknown>
}

export interface Tool {
  name: string
  description: string
  parameters: JsonSchema
  run(input: unknown, context: ToolContext): Promise<ToolOutcome>
}
