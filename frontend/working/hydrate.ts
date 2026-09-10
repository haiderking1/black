import type { Message } from '../chat/types'
import type { ToolRun } from '../chat/toolRun'
import type { TurnWork } from './model'
import { finishWork } from './reducer'

const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const time = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0
const optional = (x: unknown, check: (x: unknown) => boolean): boolean => x === undefined || check(x)

export function isToolRun(x: unknown): x is ToolRun {
  return record(x) && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.args === 'string'
    && ['result', 'diff', 'path'].every(k => optional(x[k], v => typeof v === 'string'))
    && ['isError', 'interrupted'].every(k => optional(x[k], v => typeof v === 'boolean'))
    && ['offset', 'limit', 'lines'].every(k => optional(x[k], time))
    && optional(x.images, v => Array.isArray(v) && v.every(i => record(i) && typeof i.mimeType === 'string' && typeof i.data === 'string' && optional(i.name, n => typeof n === 'string')))
}

export function isTurnWork(x: unknown): x is TurnWork {
  if (!record(x) || x.version !== 1 || !time(x.startedAt) || !time(x.updatedAt) || x.updatedAt < x.startedAt
    || !optional(x.elapsedMs, time) || !optional(x.expanded, v => typeof v === 'boolean')
    || !optional(x.expandedBlocks, v => record(v) && Object.entries(v).every(([k, value]) => /^work:\d+$/.test(k) && typeof value === 'boolean'))
    || !optional(x.error, v => typeof v === 'string')
    || !['active', 'completed', 'stopped', 'failed', 'interrupted', 'incomplete'].includes(String(x.status))
    || !Array.isArray(x.parts)) return false
  let lastRound = -1
  for (const p of x.parts) {
    if (!record(p) || !Number.isSafeInteger(p.round) || (p.round as number) < lastRound || (p.round as number) < 0) return false
    lastRound = p.round as number
    if (p.type === 'text') { if (typeof p.text !== 'string') return false }
    else if (p.type === 'thinking') {
      if (typeof p.text !== 'string' || !time(p.startedAt) || !optional(p.durationMs, time) || !optional(p.signature, v => typeof v === 'string')) return false
    } else if (p.type === 'tools') {
      if (!Array.isArray(p.runs) || !p.runs.every(isToolRun)) return false
      if (new Set(p.runs.map(r => r.id)).size !== p.runs.length) return false
    } else return false
  }
  return true
}

/** A reload cannot resume the RPC. Freeze at the last recorded event, not replay time. */
export function hydrateMessage(message: Message): Message {
  const { work, tools, thinking, thinkingMs, ...rest } = message
  const clean: Message = { ...rest,
    ...(Array.isArray(tools) ? { tools: tools.filter(isToolRun).map(run => run.result === undefined ? { ...run, interrupted: true } : run) } : {}),
    ...(typeof thinking === 'string' ? { thinking } : {}),
    ...(time(thinkingMs) ? { thinkingMs } : {}) }
  if (!isTurnWork(work)) return clean
  const restored = { ...clean, work }
  return work.status === 'active'
    ? finishWork(restored, 'interrupted', work.updatedAt, 'Connection ended before the reply finished.') : restored
}
