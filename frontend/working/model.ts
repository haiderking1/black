import type { ToolRun } from '../chat/toolRun'

export type WorkPart =
  | { type: 'text'; round: number; text: string }
  | { type: 'thinking'; round: number; text: string; startedAt: number; durationMs?: number; signature?: string }
  | { type: 'tools'; round: number; runs: ToolRun[] }

export type WorkStatus = 'active' | 'completed' | 'stopped' | 'failed' | 'interrupted' | 'incomplete'

/** UI transcript, not an additional copy of provider history. */
export interface TurnWork {
  version: 1
  parts: WorkPart[]
  startedAt: number
  updatedAt: number
  elapsedMs?: number
  status: WorkStatus
  error?: string
  /** Only a deliberate header toggle sets this. No automatic collapsing. */
  expanded?: boolean
  expandedBlocks?: Record<string, boolean>
}

export function startWork(now = Date.now()): TurnWork {
  return { version: 1, parts: [], startedAt: now, updatedAt: now, status: 'active' }
}

export function splitWork(work: TurnWork): { activity: WorkPart[]; answer: string } {
  const toolRounds = new Set(work.parts.filter(p => p.type === 'tools').map(p => p.round))
  const activity: WorkPart[] = []
  let answer = ''
  const lastActivity = work.parts.findLastIndex(p => p.type === 'tools' || (p.type === 'thinking' && p.text !== ''))
  for (const [index, part] of work.parts.entries()) {
    if (part.type === 'text' && index > lastActivity && !toolRounds.has(part.round)) answer += part.text
    else if (part.type !== 'thinking' || part.text !== '') activity.push(part)
  }
  return { activity, answer }
}

export function workIsExpanded(work: Pick<TurnWork, 'expanded'>): boolean {
  return work.expanded ?? false
}
