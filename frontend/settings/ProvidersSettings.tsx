import React from 'react'
import { AlertCircle } from 'lucide-react'

import { ProviderRow } from './ProviderRow'
import { useProviders } from './useProviders'
import './providers.css'

/**
 * Providers.
 *
 * Credentials are held by the server, so this screen shows status and accepts a
 * key. Nothing here reads a stored key back, which is why the field starts
 * empty even when one is configured.
 */
export function ProvidersSettings(): React.JSX.Element {
  const { providers, isLoading, error, setApiKey, clearApiKey, setEnabled } = useProviders()

  return (
    <div className="settings-providers">
      {error !== null ? (
        <div className="settings-provider-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <section aria-label="Providers">
        <div className="settings-provider-list">
          {providers.length === 0 ? (
            <div className="settings-provider-empty">
              {isLoading ? 'Loading providers\u2026' : 'No providers available.'}
            </div>
          ) : (
            providers.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                onSetApiKey={setApiKey}
                onClearApiKey={clearApiKey}
                onSetEnabled={setEnabled}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
