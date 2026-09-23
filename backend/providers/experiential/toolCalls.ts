import type { ToolCall } from '../types'

interface PartialToolCall {
  id: string
  name: string
  arguments: string
}

/** Responses streams send a final full item after the argument deltas. */
export class ExperientialToolCalls {
  private readonly partials = new Map<number, PartialToolCall>()

  opened(index: number, item: Record<string, unknown>): void {
    const current = this.partials.get(index) ?? { id: '', name: '', arguments: '' }
    if (typeof item.call_id === 'string' && item.call_id !== '') current.id = item.call_id
    if (typeof item.name === 'string' && item.name !== '') current.name = item.name
    if (typeof item.arguments === 'string') current.arguments = item.arguments
    this.partials.set(index, current)
  }

  appendArguments(index: number, delta: string): void {
    const current = this.partials.get(index) ?? { id: '', name: '', arguments: '' }
    current.arguments += delta
    this.partials.set(index, current)
  }

  finished(index: number, item: Record<string, unknown>): void {
    const current = this.partials.get(index) ?? { id: '', name: '', arguments: '' }
    if (typeof item.call_id === 'string' && item.call_id !== '') current.id = item.call_id
    if (typeof item.name === 'string' && item.name !== '') current.name = item.name
    if (typeof item.arguments === 'string') current.arguments = item.arguments
    this.partials.set(index, current)
  }

  calls(): ToolCall[] {
    return [...this.partials.entries()]
      .sort(([left], [right]) => left - right)
      .flatMap(([index, call]) => call.name === '' ? [] : [{
        id: call.id === '' ? 'call_' + String(index) : call.id,
        name: call.name,
        arguments: call.arguments,
      }])
  }
}
