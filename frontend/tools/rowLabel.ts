import type { ToolRun } from '../chat/toolRun'
import { baseName } from './filePath'

export interface ToolRowLabel {
  verb: string
  name: string
  note?: string
  added?: number
  removed?: number
}

export function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (/^\+ *\d+ /.test(line)) added++
    else if (/^- *\d+ /.test(line)) removed++
  }
  return { added, removed }
}

function readNote(run: ToolRun): string | undefined {
  const { offset, limit } = run
  if (offset === undefined && limit === undefined) return undefined
  if (offset === undefined) return 'first ' + String(limit) + ' lines'
  if (limit === undefined) return 'from line ' + String(offset)
  return 'lines ' + String(offset) + '–' + String(offset + limit - 1)
}

export function rowLabel(run: ToolRun): ToolRowLabel {
  if (run.name === 'compute') {
    try {
      const args = JSON.parse(run.args)
      if (typeof args?.title === 'string' && args.title.trim()) return { verb: args.title.trim(), name: '' }
    } catch { /* Arguments can still be streaming. */ }
    return { verb: 'Compute', name: '' }
  }
  const verb = run.name === 'read' ? 'Read' : run.name === 'write' ? 'Wrote' : run.name === 'edit' ? 'Edited' : run.name
  if (run.path === undefined) {
    const text = run.args.replace(/\s+/g, ' ').trim()
    const note = text.length > 72 ? text.slice(0, 71) + '…' : text
    return { verb, name: '', ...(note === '' ? {} : { note }) }
  }
  const base: ToolRowLabel = { verb, name: baseName(run.path) }
  if (run.result !== undefined && run.isError !== true) {
    if (run.diff !== undefined) {
      const { added, removed } = countDiffLines(run.diff)
      return { ...base, ...(added ? { added } : {}), ...(removed ? { removed } : {}) }
    }
    // A write reports lines written, not a net addition to an existing file.
    if (run.name === 'write' && run.lines !== undefined) return { ...base, note: String(run.lines) + ' lines' }
  }
  if (run.name === 'read') {
    const note = readNote(run)
    return { ...base, ...(note === undefined ? {} : { note }) }
  }
  return base
}
