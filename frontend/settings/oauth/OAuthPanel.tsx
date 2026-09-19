import React, { useRef, useState } from 'react'

import { useT } from '../../i18n'
import { oauthCopyKey } from './copy'

interface OAuthPanelProps {
  providerId: string
  authenticated: boolean
  onStart: (providerId: string) => Promise<void>
  onCancel: (providerId: string) => Promise<void>
  onSubmitCode: (providerId: string, input: string) => Promise<void>
  onSignOut: (providerId: string) => Promise<void>
}

export function OAuthPanel({
  providerId,
  authenticated,
  onStart,
  onCancel,
  onSubmitCode,
  onSignOut,
}: OAuthPanelProps): React.JSX.Element {
  const t = useT()
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const starting = useRef(false)

  const start = async (): Promise<void> => {
    if (starting.current || pending) return
    starting.current = true
    setPending(true)
    try {
      await onStart(providerId)
      setDraft('')
    } catch {
      // The RPC error is shown on the providers screen.
    } finally {
      starting.current = false
      setPending(false)
    }
  }

  const cancel = async (): Promise<void> => {
    setBusy(true)
    try {
      await onCancel(providerId)
    } finally {
      setPending(false)
      setBusy(false)
    }
  }

  const submit = async (): Promise<void> => {
    const value = draft.trim()
    if (value === '' || busy) return
    setBusy(true)
    try {
      await onSubmitCode(providerId, value)
    } catch {
      // Keep the draft for retry.
    } finally {
      setBusy(false)
    }
  }

  if (authenticated && !pending) {
    return (
      <div className="settings-provider-key">
        <p className="settings-provider-hint">{t('providers.oauthConnected')}</p>
        <div className="settings-provider-key-field">
          <button
            type="button"
            className="settings-provider-save"
            disabled={busy}
            onClick={() => void onSignOut(providerId)}
          >
            {t('providers.signOut')}
          </button>
        </div>
      </div>
    )
  }

  if (pending) {
    return (
      <div className="settings-provider-key">
        <label className="settings-provider-key-label" htmlFor={'oauth-' + providerId}>
          {t('providers.pasteCode')}
        </label>
        <p className="settings-provider-hint">{t('providers.waitingBrowser')}</p>
        <div className="settings-provider-key-field">
          <input
            id={'oauth-' + providerId}
            className="settings-provider-input"
            value={draft}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            placeholder={t(oauthCopyKey('providers.pasteCodePlaceholder', providerId))}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
          />
          <button
            type="button"
            className="settings-provider-save"
            disabled={draft.trim() === '' || busy}
            onClick={() => void submit()}
          >
            {t('providers.submitCode')}
          </button>
          <button
            type="button"
            className="settings-provider-save settings-provider-save-secondary"
            disabled={busy}
            onClick={() => void cancel()}
          >
            {t('providers.cancelSignIn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-provider-key">
      <p className="settings-provider-hint">{t(oauthCopyKey('providers.oauthHint', providerId))}</p>
      <div className="settings-provider-key-field">
        <button type="button" className="settings-provider-save" disabled={busy} onClick={() => void start()}>
          {t(oauthCopyKey('providers.signIn', providerId))}
        </button>
      </div>
    </div>
  )
}
