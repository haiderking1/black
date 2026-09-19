import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ModelPanel } from '../frontend/composer/ModelPanel'
import { LanguageProvider } from '../frontend/language'
import { ClineLogo } from '../frontend/providers/ClineLogo'

describe('Cline logo', () => {
  it('owns its color class so a muted parent cannot wash the bot mark out', () => {
    const html = renderToStaticMarkup(<ClineLogo size={20} />)
    expect(html).toContain('class="cline-logo"')
    expect(html).toContain('fill="currentColor"')
    expect(html).toContain('viewBox="0 0 24 24"')
    expect(html).toContain('aria-label="Cline"')
  })

  it('keeps the rail mark at full strength on the left of the picker', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="en">
        <ModelPanel
          models={[{ id: 'cline-pass/qwen3.7-max', ownedBy: 'cline-pass', created: 0, name: 'Qwen 3.7 Max' }]}
          selectedModelId="cline-pass/qwen3.7-max"
          providerId="cline"
          providerName="ClinePass"
          providers={[{ id: 'cline', name: 'ClinePass' }]}
          onSelect={() => {}}
          close={() => {}}
        />
      </LanguageProvider>,
    )
    expect(html).toContain('model-rail-mark')
    expect(html).toContain('cline-logo')
    expect(html).toContain('aria-label="Cline"')
  })
})
