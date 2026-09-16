import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ModelPanel } from '../frontend/composer/ModelPanel'
import { LanguageProvider } from '../frontend/language'
import { CodexLogo } from '../frontend/providers/CodexLogo'

describe('Codex logo', () => {
  it('owns its color class so a muted parent cannot wash the blossom out', () => {
    const html = renderToStaticMarkup(<CodexLogo size={20} />)
    expect(html).toContain('class="codex-logo"')
    expect(html).toContain('fill="currentColor"')
    expect(html).toContain('viewBox="1.68 1.75 16.65 16.5"')
    expect(html).not.toContain('M22.282')
  })

  it('keeps the rail mark at full strength on the left of the picker', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="en">
        <ModelPanel
          models={[{ id: 'gpt-5.5', ownedBy: 'openai', created: 0, name: 'GPT-5.5' }]}
          selectedModelId="gpt-5.5"
          providerId="openai-codex"
          providerName="OpenAI Codex"
          providers={[{ id: 'openai-codex', name: 'OpenAI Codex' }]}
          onSelect={() => {}}
          close={() => {}}
        />
      </LanguageProvider>,
    )
    expect(html).toContain('model-rail-mark')
    expect(html).toContain('codex-logo')
    expect(html).toContain('aria-label="OpenAI Codex"')
  })
})
