import React, { useEffect, useState } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'

import { UsageWindowCard } from './UsageWindowCard'
import { formatPlanName } from './formatPlanName'
import { ProviderLogo } from '../providers'
import { useCodexUsage } from './useCodexUsage'
import { useT } from '../i18n'
import './usage.css'

function updatedLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
}

export function CodexUsagePage(): React.JSX.Element {
  const t = useT()
  const { usage, loading, refreshing, error, refresh } = useCodexUsage()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const planName = usage?.planType?.trim()

  return (
    <div className="codex-usage-page">
      <header className="settings-content-header">
        <span className="settings-eyebrow">{t('settings.eyebrow')}</span>
        <h1>{t('usage.title')}</h1>
        <p>{t('usage.subtitle')}</p>
      </header>

      <section className="codex-usage-panel" aria-label={t('usage.aria')}>
        <div className="codex-usage-panel-topline">
          <div className="codex-usage-provider">
            <span className="codex-usage-provider-mark" aria-hidden="true"><ProviderLogo providerId="openai-codex" size={23} /></span>
            <div>
              <span className="codex-usage-provider-label">{t('usage.provider')}</span>
              <strong>OpenAI Codex</strong>
            </div>
          </div>
          <div className="codex-usage-panel-actions">
            {usage !== null ? (
              <span className="codex-usage-updated">{t('usage.updated', { time: updatedLabel(usage.fetchedAt) })}</span>
            ) : null}
            <button
              type="button"
              className="codex-usage-refresh"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label={refreshing ? t('usage.refreshing') : t('usage.refresh')}
              title={refreshing ? t('usage.refreshing') : t('usage.refresh')}
            >
              <RotateCw size={15} aria-hidden="true" className={refreshing ? 'is-spinning' : ''} />
            </button>
          </div>
        </div>

        {planName !== undefined ? <div className="codex-usage-plan">{formatPlanName(planName)}</div> : null}

        {error !== null ? (
          <div className="codex-usage-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <div><strong>{t('usage.loadFailed')}</strong><span>{error}</span></div>
            {usage === null ? <button type="button" onClick={() => void refresh()}>{t('usage.tryAgain')}</button> : null}
          </div>
        ) : null}

        {loading && usage === null ? (
          <div className="codex-usage-loading" role="status" aria-label={t('usage.loading')}>
            <span /><span />
          </div>
        ) : usage !== null ? (
          <div className="codex-usage-windows">
            {usage.weekly !== null ? (
              <UsageWindowCard kind="weekly" window={usage.weekly} now={now} />
            ) : (
              <div className="codex-usage-missing">{t('usage.weeklyUnavailable')}</div>
            )}
            {usage.fiveHour !== null ? (
              <UsageWindowCard kind="fiveHour" window={usage.fiveHour} now={now} />
            ) : null}
          </div>
        ) : !loading && error === null ? (
          <div className="codex-usage-empty">{t('usage.signInHint')}</div>
        ) : null}
      </section>

    </div>
  )
}
