/**
 * Extracting reasoning from a completion.
 *
 * Reasoning models do not agree on where thinking lives. The OpenAI-compatible
 * gateways put it in one of several sibling fields, some put it inside the
 * content array as a block, and Anthropic-style responses use a thinking block
 * with a signature. All of them are read here so a caller gets the thinking
 * regardless of which vendor answered.
 */

/** Sibling fields seen in the wild for a reasoning string on the message. */
const REASONING_TEXT_FIELDS = ['reasoning', 'reasoning_content', 'reasoning_text'] as const

/** Block types that carry thinking rather than answer text. */
const THINKING_BLOCK_TYPES = ['thinking', 'reasoning', 'reasoning_text'] as const

export interface ExtractedContent {
  text: string
  thinking: string
  /** Serialized replay metadata, when the response carried any. */
  thinkingSignature?: string
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Read one content block, separating answer text from thinking. */
function readBlock(block: unknown): { text?: string; thinking?: string; signature?: string } {
  if (typeof block !== 'object' || block === null) return {}
  const candidate = block as { type?: unknown; text?: unknown; thinking?: unknown; signature?: unknown }
  const type = typeof candidate.type === 'string' ? candidate.type : undefined

  if (type !== undefined && (THINKING_BLOCK_TYPES as readonly string[]).includes(type)) {
    return {
      ...(asNonEmptyString(candidate.thinking) !== undefined
        ? { thinking: asNonEmptyString(candidate.thinking) }
        : {}),
      ...(asNonEmptyString(candidate.text) !== undefined
        ? { thinking: asNonEmptyString(candidate.text) }
        : {}),
      ...(asNonEmptyString(candidate.signature) !== undefined
        ? { signature: asNonEmptyString(candidate.signature) }
        : {}),
    }
  }

  if (type === undefined || type === 'text' || type === 'output_text') {
    return asNonEmptyString(candidate.text) !== undefined ? { text: asNonEmptyString(candidate.text) } : {}
  }

  return {}
}

/**
 * Pull answer text and thinking out of a message.
 *
 * Content may be a plain string or a block array. Reasoning may sit in a
 * sibling field, in the block array, or both.
 */
export function extractContent(message: unknown): ExtractedContent {
  if (typeof message === 'string') return { text: message, thinking: '' }
  if (typeof message !== 'object' || message === null) return { text: '', thinking: '' }

  const candidate = message as Record<string, unknown>

  let text = ''
  let thinking = ''
  const blockSignatures: string[] = []

  const content = candidate['content']
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    for (const block of content) {
      const read = readBlock(block)
      if (read.text !== undefined) text += read.text
      if (read.thinking !== undefined) thinking += read.thinking
      // A signature on a thinking block is what lets the model recognize its own
      // earlier reasoning later. Dropping it costs continuity on the next turn.
      if (read.signature !== undefined) blockSignatures.push(read.signature)
    }
  }

  for (const field of REASONING_TEXT_FIELDS) {
    const value = asNonEmptyString(candidate[field])
    if (value !== undefined) {
      thinking += value
      break
    }
  }

  // Anthropic-style responses carry thinking as its own top-level block list.
  const topLevelThinking = candidate['thinking']
  if (typeof topLevelThinking === 'string' && topLevelThinking !== '') thinking += topLevelThinking

  // Sibling replay metadata wins when present; otherwise block signatures are
  // the only continuity payload the response carried.
  const signature = signatureOf(candidate) ?? serializeSignatures(blockSignatures)
  return signature !== undefined ? { text, thinking, thinkingSignature: signature } : { text, thinking }
}

/** Serialize block-level signatures, or undefined when there were none. */
function serializeSignatures(signatures: string[]): string | undefined {
  if (signatures.length === 0) return undefined
  if (signatures.length === 1) return signatures[0]
  try {
    return JSON.stringify(signatures)
  } catch {
    return undefined
  }
}

/** Serialize replay metadata, which arrives as an array of details. */
function signatureOf(candidate: Record<string, unknown>): string | undefined {
  const details = candidate['reasoning_details']
  if (details === undefined || details === null) {
    const direct = asNonEmptyString(candidate['thinkingSignature'])
    return direct
  }
  try {
    const serialized = JSON.stringify(details)
    return serialized === undefined || serialized === '[]' ? undefined : serialized
  } catch {
    return undefined
  }
}
