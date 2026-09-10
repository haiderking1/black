import type { ToolCall } from '../providers/types'

/**
 * Turning a tool call's argument string into the object a tool expects.
 *
 * The arguments arrive as text the model wrote, so every one of these is a real
 * case: an empty string when the call takes nothing, a JSON object, and text
 * that is simply not valid JSON because the model ran out of room or lost the
 * thread mid object.
 *
 * A malformed payload is returned as an error for the model rather than thrown,
 * so it can correct itself on the next turn instead of failing the run.
 */
export function parseToolArguments(call: ToolCall): { ok: true; value: unknown } | { ok: false; error: string } {
  const raw = call.arguments.trim()

  if (raw.length === 0) {
    return { ok: true, value: {} }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      error:
        'The arguments for ' + call.name + ' were not valid JSON, so nothing was run. Send the call again with arguments as a JSON object. Received: ' + truncate(raw)
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'The arguments for ' + call.name + ' must be a JSON object, but were ' + describe(parsed) + '. Send the call again.'
    }
  }

  return { ok: true, value: parsed }
}

function describe(value: unknown): string {
  if (Array.isArray(value)) return 'an array'
  if (value === null) return 'null'
  return typeof value
}

function truncate(text: string): string {
  return text.length <= 200 ? text : text.slice(0, 200) + '...'
}
