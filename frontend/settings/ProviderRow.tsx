import React, { useId, useState } from 'react'
import { ChevronDown, Eye, EyeOff, Trash2 } from 'lucide-react'

import type { ProviderStatus } from '../../contracts/providers'
import { CodexLogo, OpenCodeLogo, OpenRouterLogo } from '../providers'
import { useT } from '../i18n'
import { OAuthPanel } from './oauth/OAuthPanel'

/** The logo per provider. A provider without an entry falls back to its initial. */
const LOGOS: Record<string, (props: { size?: number }) => React.JSX.Element> = {
  'opencode-go': OpenCodeLogo,
  openrouter: OpenRouterLogo,
  'openai-codex': CodexLogo,
}

function NetworkMark(): React.JSX.Element {
  return <span className="settings-provider-logo-fallback" aria-hidden="true" />
}

interface ProviderRowProps {
  provider: ProviderStatus
  onSetApiKey: (providerId: string, apiKey: string) => Promise<void>
  onClearApiKey: (providerId: string) => Promise<void>
  onSetEnabled: (providerId: string, enabled: boolean) => Promise<void>
  onStartOAuth?: (providerId: string) => Promise<void>
  onCancelOAuth?: (providerId: string) => Promise<void>
  onSubmitOAuthCode?: (providerId: string, input: string) => Promise<void>
}

/**
 * One provider.
 *
 * The status dot reports configured availability without showing the key, and
 * the field is empty on purpose: a stored key is never sent back to the
 * renderer, so there is nothing to prefill.
 */
export function ProviderRow({
  provider,
  onSetApiKey,
  onClearApiKey,
  onSetEnabled,
  onStartOAuth,
  onCancelOAuth,
  onSubmitOAuthCode,
}: ProviderRowProps): React.JSX.Element {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const Logo = LOGOS[provider.id]
  const canSave = draft.trim() !== '' && !isSaving
  const oauth = provider.authKind === 'oauth'
  const ready = provider.enabled && provider.authenticated
  const readyLabel = oauth ? t('providers.enabledWithOAuth') : t('providers.enabledWithKey')

  const handleSave = async (): Promise<void> => {
    if (!canSave) return
    setIsSaving(true)
    try {
      await onSetApiKey(provider.id, draft.trim())
      setDraft('')
      setRevealed(false)
    } catch {
      // useProviders displays the RPC error. Keep the draft available for retry.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={"settings-provider" + (expanded ? " is-expanded" : "")}>
      <div className="settings-provider-row">
        <button
          type="button"
          className="settings-provider-identity"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => { setExpanded(value => !value); setRevealed(false) }}
        >
          <span className="settings-provider-logo">
            {Logo !== undefined ? <Logo size={24} /> : <NetworkMark />}
            {ready ? <span className="settings-provider-dot" role="img" aria-label={readyLabel} title={readyLabel} /> : null}
          </span>
          <span className="settings-provider-copy">
            <span className="settings-provider-title">
              <span className="settings-provider-name">{provider.name}</span>

            </span>
          </span>
          <ChevronDown className="settings-provider-chevron" size={15} aria-hidden="true" />
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={provider.enabled}
          aria-label={t('providers.enabledAria', { name: provider.name })}
          className={'settings-switch ' + (provider.enabled ? 'active' : '')}
          onClick={() => void onSetEnabled(provider.id, !provider.enabled)}
        >
          <span className="settings-switch-knob" />
        </button>
      </div>

      <div id={panelId} hidden={!expanded}>
      {expanded && oauth && onStartOAuth !== undefined && onCancelOAuth !== undefined && onSubmitOAuthCode !== undefined ? (
        <OAuthPanel
          providerId={provider.id}
          authenticated={provider.authenticated}
          onStart={onStartOAuth}
          onCancel={onCancelOAuth}
          onSubmitCode={onSubmitOAuthCode}
          onSignOut={onClearApiKey}
        />
      ) : null}
      {expanded && !oauth ? <div className="settings-provider-key">
        <label className="settings-provider-key-label" htmlFor={'key-' + provider.id}>
          {t('providers.apiKey')}
        </label>
        <div className="settings-provider-key-field">
          <input
            id={'key-' + provider.id}
            type={revealed ? 'text' : 'password'}
            className="settings-provider-input"
            value={draft}
            disabled={isSaving}
            spellCheck={false}
            autoComplete="off"
            placeholder={provider.authenticated ? t('providers.replaceKey') : t('providers.pasteKey')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave()
            }}
          />

          <button
            type="button"
            className="settings-provider-icon-button"
            aria-label={revealed ? t('providers.hideKey') : t('providers.showKey')}
            onClick={() => setRevealed((prev) => !prev)}
          >
            {revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>

          <button
            type="button"
            className="settings-provider-save"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {isSaving ? t('providers.saving') : t('providers.save')}
          </button>

          {provider.authenticated ? (
            <button
              type="button"
              className="settings-provider-icon-button"
              aria-label={t('providers.removeKey')}
              disabled={isSaving}
              onClick={() => void onClearApiKey(provider.id)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="settings-provider-hint">
          {t('providers.keyHint')}
        </p>
      </div> : null}
      </div>
    </div>
  )
}
