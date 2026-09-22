import React from 'react'
import { Clock3 } from 'lucide-react'
import type { CodexUsageWindow } from '../../contracts/codexUsage'
import { useT } from '../i18n'

interface UsageWindowCardProps {
  kind: 'weekly' | 'fiveHour'
  window: CodexUsageWindow
  now: number
}

function resetLabel(resetAt: number | null, now: number, t: ReturnType<typeof useT>): string {
  if (resetAt === null) return t('usage.resetUnknown')
  const minutesLeft = Math.ceil(Math.max(0, resetAt * 1000 - now) / 60_000)
  if (minutesLeft === 0) return t('usage.resetNow')
  const days = Math.floor(minutesLeft / (24 * 60))
  const hours = Math.floor((minutesLeft % (24 * 60)) / 60)
  const minutes = minutesLeft % 60
  const duration = days > 0
    ? hours > 0 ? t('usage.duration.daysHours', { days, hours }) : t('usage.duration.days', { days })
    : hours > 0
      ? minutes > 0 ? t('usage.duration.hoursMinutes', { hours, minutes }) : t('usage.duration.hours', { hours })
      : t('usage.duration.minutes', { minutes })
  return t('usage.resetIn', { duration })
}

export function UsageWindowCard({ kind, window, now }: UsageWindowCardProps): React.JSX.Element {
  const t = useT()
  const percent = Math.round(window.usedPercent)
  const level = percent >= 90 ? 'high' : percent >= 70 ? 'mid' : 'low'
  const label = kind === 'weekly' ? t('usage.weekly') : t('usage.fiveHour')
  const reset = resetLabel(window.resetAt, now, t)

  return (
    <article className={'codex-usage-window codex-usage-window-' + kind} data-level={level}>
      <div className="codex-usage-window-heading">
        <div>
          <span className="codex-usage-window-kicker">{kind === 'weekly' ? t('usage.sevenDayWindow') : t('usage.fiveHourWindow')}</span>
          <h2>{label}</h2>
        </div>
        <span className="codex-usage-percent" aria-label={t('usage.percentUsed', { percent })}>
          <strong>{percent}</strong><span>%</span>
        </span>
      </div>

      <div
        className="codex-usage-meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={t('usage.percentUsed', { percent })}
      >
        <span style={{ width: percent + '%' }} />
      </div>

      <div className="codex-usage-window-footer">
        <span>{t('usage.percentRemaining', { percent: 100 - percent })}</span>
        <span className="codex-usage-reset"><Clock3 size={13} aria-hidden="true" />{reset}</span>
      </div>
    </article>
  )
}
