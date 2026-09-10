import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProviderRow } from '../../../frontend/settings/ProviderRow'
import '../../../frontend/index.css'
import '../../../frontend/settings/settings.css'
import '../../../frontend/settings/providers.css'
import { scenarios } from './scenarios'

function Fixture() {
  const [provider, setProvider] = useState({ id: 'opencode-go', name: 'OpenCode Go', baseUrl: 'https://example.test', authenticated: false, enabled: true, modelCount: null as number | null })
  return <main style={{ padding: 24, maxWidth: 620, margin: 'auto' }}>
    <section aria-label="Providers">
    <div className="settings-provider-list"><ProviderRow provider={provider}
      onSetApiKey={async (_, key) => { if (key === 'reject') throw new Error('Test failure'); setProvider(p => ({ ...p, authenticated: true, modelCount: 36 })) }}
      onClearApiKey={async () => setProvider(p => ({ ...p, authenticated: false, modelCount: null }))}
      onSetEnabled={async (_, enabled) => setProvider(p => ({ ...p, enabled }))} />
    </div></section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
Object.assign(window, { providerHarness: { scenarios } })
