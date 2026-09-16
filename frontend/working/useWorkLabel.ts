import { useEffect, useState } from 'react'
import type { LanguagePreference } from '../../contracts/language'
import { t } from '../i18n'
import { useLanguage } from '../language'
import { formatThinkingDuration } from '../thinking/formatDuration'
import type { TurnWork } from './model'

export function workLabel(
  work: TurnWork | undefined,
  running: boolean,
  now: number,
  language: LanguagePreference = 'auto',
): string {
  if (work === undefined) return t(language, 'work.history')
  if (running && work.retry !== undefined) {
    return t(language, 'work.retrying', { attempt: work.retry.attempt, max: work.retry.maxAttempts })
  }
  const elapsed = running ? Math.max(0, now - work.startedAt)
    : work.elapsedMs ?? Math.max(0, work.updatedAt - work.startedAt)
  const duration = formatThinkingDuration(elapsed, language)
  return t(language, running ? 'work.working' : 'work.worked', { duration })
}

export function useWorkLabel(work: TurnWork | undefined, running: boolean): string {
  const language = useLanguage()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running, work?.startedAt])
  return workLabel(work, running, now, language)
}
