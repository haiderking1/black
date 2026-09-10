import type { ToolCall } from '../types'

/**
 * Rebuilding a tool call from the fragments it arrives in.
 *
 * A streamed tool call is not delivered; it is dribbled out. The first fragment
 * carries an index, an id and the function name, and every fragment after it
 * carries a slice of the arguments as a JSON string, sometimes a few characters
 * at a time:
 *
 *   {index: 0, id: "call_1", function: {name: "read", arguments: ""}}
 *   {index: 0, function: {arguments: "{\"pa"}}
 *   {index: 0, function: {arguments: "th\": \"a"}}
 *   {index: 0, function: {arguments: ".ts\"}"}}
 *
 * Nothing is usable until the last fragment lands, because a half parsed
 * argument string is not JSON. So fragments are accumulated by index and the
 * complete calls are handed over at the end of the turn.
 *
 * A model may emit several calls in one turn, which is why this is keyed by
 * index rather than being a single buffer.
 */

interface PartialCall {
  id: string
  name: string
  argumentChunks: string[]
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export class ToolCallAccumulator {
  private readonly partials = new Map<number, PartialCall>()
  private lastIndex = -1

  /** Read one `delta.tool_calls` array. Anything unrecognised is ignored. */
  add(delta: unknown): void {
    if (!Array.isArray(delta)) {
      return
    }

    for (const entry of delta) {
      this.addOne(entry)
    }
  }

  private addOne(entry: unknown): void {
    if (typeof entry !== 'object' || entry === null) {
      return
    }
    const record = entry as Record<string, unknown>

    // An index is normally present. When it is missing the fragment belongs to
    // the call most recently opened, which is how a provider that omits it on
    // continuation fragments is meant to be read.
    const rawIndex = record['index']
    const index = typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? rawIndex : Math.max(0, this.lastIndex)
    this.lastIndex = index

    const existing = this.partials.get(index) ?? { id: '', name: '', argumentChunks: [] }

    const id = asString(record['id'])
    if (id !== undefined && id.length > 0) {
      existing.id = id
    }

    const fn = record['function']
    if (typeof fn === 'object' && fn !== null) {
      const fields = fn as Record<string, unknown>
      const name = asString(fields['name'])
      if (name !== undefined && name.length > 0) {
        existing.name = name
      }
      // A null here means "no arguments", not "the arguments are the string
      // null", so it is skipped rather than stringified into the payload.
      const chunk = asString(fields['arguments'])
      if (chunk !== undefined && chunk.length > 0) {
        existing.argumentChunks.push(chunk)
      }
    }

    this.partials.set(index, existing)
  }

  hasCalls(): boolean {
    for (const partial of this.partials.values()) {
      if (partial.name.length > 0) {
        return true
      }
    }
    return false
  }

  /**
   * The calls as the model emitted them, in index order.
   *
   * A call with no name is dropped. It cannot be dispatched, and passing it on
   * would make the model repeat itself against a result that never comes.
   */
  calls(): ToolCall[] {
    const indexes = [...this.partials.keys()].sort((left, right) => left - right)
    const calls: ToolCall[] = []
    for (const index of indexes) {
      const partial = this.partials.get(index)
      if (partial === undefined || partial.name.length === 0) {
        continue
      }
      calls.push({
        id: partial.id.length > 0 ? partial.id : 'call_' + String(index),
        name: partial.name,
        arguments: partial.argumentChunks.join('')
      })
    }
    return calls
  }
}
