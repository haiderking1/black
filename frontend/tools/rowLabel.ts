import type { LanguagePreference } from '../../contracts/language'
import type { ToolRun } from '../chat/toolRun'
import { t } from '../i18n'
import { baseName } from './filePath'

export interface ToolRowLabel {
  verb: string
  name: string
  note?: string
  command?: string
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

function readNote(run: ToolRun, language: LanguagePreference): string | undefined {
  const { offset, limit } = run
  if (offset === undefined && limit === undefined) return undefined
  if (offset === undefined) return t(language, 'tool.firstLines', { n: String(limit) })
  if (limit === undefined) return t(language, 'tool.fromLine', { n: String(offset) })
  return t(language, 'tool.linesRange', { a: String(offset), b: String(offset + limit - 1) })
}

export function rowLabel(run: ToolRun, language: LanguagePreference = 'auto'): ToolRowLabel {
  if (run.name === 'compute') {
    try {
      const args = JSON.parse(run.args)
      if (typeof args?.title === 'string' && args.title.trim()) return { verb: args.title.trim(), name: '' }
    } catch { /* Arguments can still be streaming. */ }
    return { verb: t(language, 'tool.compute'), name: '' }
  }
  if (run.name === 'bash') {
    try {
      const args = JSON.parse(run.args)
      if (typeof args?.command === 'string') {
        const compact = args.command.replace(/\s+/g, ' ').trim()
        return { verb: t(language, 'tool.bash'), name: '', command: args.command, note: compact.length > 72 ? compact.slice(0, 71) + '…' : compact }
      }
    } catch { /* Arguments can still be streaming. */ }
    return { verb: t(language, 'tool.bash'), name: '' }
  }
  const verb =
    run.name === 'read'
      ? t(language, 'tool.read')
      : run.name === 'write'
        ? t(language, 'tool.wrote')
        : run.name === 'edit'
          ? t(language, 'tool.edited')
          : run.name
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
    if (run.name === 'write' && run.lines !== undefined) return { ...base, note: t(language, 'tool.lines', { n: String(run.lines) }) }
  }
  if (run.name === 'read') {
    const note = readNote(run, language)
    return { ...base, ...(note === undefined ? {} : { note }) }
  }
  return base
}
