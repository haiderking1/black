import React, { useState } from 'react'
import { Check, Eye, EyeOff, Trash2 } from 'lucide-react'

import type { ProviderStatus } from '../../contracts/providers'
import { OpenCodeLogo } from '../providers'

/** The logo per provider. A provider without an entry falls back to its initial. */
const LOGOS: Record<string, (props: { size?: number }) => React.JSX.Element> = {
  'opencode-go': OpenCodeLogo,
}

function NetworkMark(): React.JSX.Element {
  return <span className="settings-provider-logo-fallback" aria-hidden="true" />
}

interface ProviderRowProps {
  provider: ProviderStatus
  onSetApiKey: (providerId: string, apiKey: string) => Promise<void>
  onClearApiKey: (providerId: string) => Promise<void>
  onSetEnabled: (providerId: string, enabled: boolean) => Promise<void>
}

/**
 * One provider.
 *
 * The status line reports what is configured without ever showing the key, and
 * the field is empty on purpose: a stored key is never sent back to the
 * renderer, so there is nothing to prefill.
 */
export function ProviderRow({
  provider,
  onSetApiKey,
  onClearApiKey,
  onSetEnabled,
}: ProviderRowProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const Logo = LOGOS[provider.id]
  const canSave = draft.trim() !== '' && !isSaving

  const status = provider.authenticated
    ? 'Authenticated' + (provider.modelCount !== null ? ' \u00b7 ' + provider.modelCount + ' models' : '')
    : 'No API key'

  const handleSave = async (): Promise<void> => {
    if (!canSave) return
    setIsSaving(true)
    try {
      await onSetApiKey(provider.id, draft.trim())
      setDraft('')
      setRevealed(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="settings-provider">
      <div className="settings-provider-row">
        <div className="settings-provider-identity">
          <span className="settings-provider-logo">
            {Logo !== undefined ? <Logo size={32} /> : <NetworkMark />}
          </span>
          <div className="settings-provider-copy">
            <div className="settings-provider-title">
              <span className="settings-provider-name">{provider.name}</span>
              {provider.authenticated ? (
                <Check className="settings-provider-check" size={14} aria-hidden="true" />
              ) : null}
            </div>
            <span className="settings-provider-status">{status}</span>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={provider.enabled}
          aria-label={provider.name + ' enabled'}
          className={'settings-switch ' + (provider.enabled ? 'active' : '')}
          onClick={() => void onSetEnabled(provider.id, !provider.enabled)}
        >
          <span className="settings-switch-knob" />
        </button>
      </div>

      <div className="settings-provider-key">
        <label className="settings-provider-key-label" htmlFor={'key-' + provider.id}>
          API key
        </label>
        <div className="settings-provider-key-field">
          <input
            id={'key-' + provider.id}
            type={revealed ? 'text' : 'password'}
            className="settings-provider-input"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            placeholder={provider.authenticated ? 'Replace the stored key' : 'Paste your key'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave()
            }}
          />

          <button
            type="button"
            className="settings-provider-icon-button"
            aria-label={revealed ? 'Hide key' : 'Show key'}
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
            {isSaving ? 'Saving' : 'Save'}
          </button>

          {provider.authenticated ? (
            <button
              type="button"
              className="settings-provider-icon-button"
              aria-label="Remove key"
              onClick={() => void onClearApiKey(provider.id)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="settings-provider-hint">
          Stored in your agent directory and sent only to this provider.
        </p>
      </div>
    </div>
  )
}
