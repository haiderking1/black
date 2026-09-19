import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { LanguageProvider } from '../frontend/language'
import { OAuthPanel } from '../frontend/settings/oauth/OAuthPanel'

const noop = async (): Promise<void> => {}

function render(authenticated: boolean, language: 'en' | 'ar' = 'en'): string {
  return renderToStaticMarkup(
    <LanguageProvider language={language}>
      <OAuthPanel
        providerId="openai-codex"
        authenticated={authenticated}
        onStart={noop}
        onCancel={noop}
        onSubmitCode={noop}
        onSignOut={noop}
      />
    </LanguageProvider>,
  )
}

describe('Codex OAuth panel', () => {
  it('offers ChatGPT sign-in before a session exists', () => {
    const html = render(false)
    expect(html).toContain('Sign in with ChatGPT')
    expect(html).toContain('ChatGPT Plus or Pro')
    expect(html).not.toContain('Sign out')
  })

  it('shows sign-out after a session is stored', () => {
    const html = render(true)
    expect(html).toContain('Sign out')
    expect(html).toContain('Signed in.')
    expect(html).not.toContain('Sign in with ChatGPT')
  })

  it('uses Arabic chrome when the UI language is Arabic', () => {
    const html = render(false, 'ar')
    expect(html).toContain('دخول عبر ChatGPT')
  })
})

describe('Cline OAuth panel', () => {
  it('offers ClinePass sign-in, not ChatGPT copy', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="en">
        <OAuthPanel
          providerId="cline"
          authenticated={false}
          onStart={noop}
          onCancel={noop}
          onSubmitCode={noop}
          onSignOut={noop}
        />
      </LanguageProvider>,
    )
    expect(html).toContain('Sign in with ClinePass')
    expect(html).toContain('ClinePass. A browser window opens')
    expect(html).not.toContain('Sign in with ChatGPT')
    expect(html).not.toContain('ChatGPT Plus')
  })
})
