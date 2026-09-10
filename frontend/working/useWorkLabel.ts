import { useEffect, useState } from 'react'
import { formatThinkingDuration } from '../thinking/formatDuration'
import type { TurnWork } from './model'

export function workLabel(work: TurnWork | undefined, running: boolean, now: number): string {
  if (work === undefined) return 'Work history'
  const elapsed = running ? Math.max(0, now - work.startedAt)
    : work.elapsedMs ?? Math.max(0, work.updatedAt - work.startedAt)
  return (running ? 'Working for ' : 'Worked for ') + formatThinkingDuration(elapsed)
}

export function useWorkLabel(work: TurnWork | undefined, running: boolean): string {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running, work?.startedAt])
  return workLabel(work, running, now)
}
