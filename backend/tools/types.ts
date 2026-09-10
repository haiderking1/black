/** A JSON Schema object, shaped the way the chat completions API expects it. */
export interface JsonSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

/** Everything a tool needs that is not in its arguments. */
export interface ToolContext {
  /** The directory relative paths resolve against. */
  cwd: string
  signal?: AbortSignal
}

export interface ToolOutcome {
  /** The text that becomes the tool result the model reads on its next turn. */
  content: string
  /** Anything the interface wants to show beyond the text. Never sent to the model. */
  details?: Record<string, unknown>
}

export interface Tool {
  name: string
  description: string
  parameters: JsonSchema
  run(input: unknown, context: ToolContext): Promise<ToolOutcome>
}
