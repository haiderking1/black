import React from 'react'
import { useT } from '../../i18n'
import type { TurnRetry } from '../model'

export function RetryNotice({ retry, error, onRetry }: {
  retry?: TurnRetry
  error?: string
  onRetry?: () => void
}): React.JSX.Element | null {
  const t = useT()
  const reason = retry?.error ?? error
  if (reason === undefined && onRetry === undefined) return null
  return <div className="working-retry">
    {reason === undefined ? null : <div className="working-error" role="status">{reason}</div>}
    {onRetry === undefined ? null : <button type="button" className="working-retry-button" onClick={onRetry}>{t('work.retry')}</button>}
  </div>
}
