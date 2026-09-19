import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { SessionRow } from '../frontend/sidebar/SessionRow'
import type { SessionRecord } from '../frontend/sidebar/types'
import { LanguageProvider } from '../frontend/language'

const render = (element: React.ReactElement): string =>
  renderToStaticMarkup(<LanguageProvider language="en">{element}</LanguageProvider>)

describe('SessionRow component', () => {
  const dummySession: SessionRecord = {
    id: 's-123',
    projectId: 'p-1',
    title: 'Add rate limiting to /v1/ingest',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    model: 'openai/gpt-5',
    providerId: 'openai-codex',
  }

  it('hides the status dot when idle', () => {
    const html = render(
      <SessionRow
        session={dummySession}
        isActive={false}
        isWorking={false}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )
    expect(html).not.toContain('session-status-dot')
  })

  it('renders the working dot only while working', () => {
    const html = render(
      <SessionRow
        session={dummySession}
        isActive={true}
        isWorking={true}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )
    expect(html).toContain('session-status-dot working')
  })

  it('marks the active row with the active class and no bar', () => {
    const activeHtml = render(
      <SessionRow
        session={dummySession}
        isActive={true}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )
    expect(activeHtml).toContain('session-row active')
    expect(activeHtml).not.toContain('session-active-bar')

    const inactiveHtml = render(
      <SessionRow
        session={dummySession}
        isActive={false}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )
    expect(inactiveHtml).not.toContain('session-row active')
  })

  it('shows git branch with branch name when project is a git repo', () => {
    const html = render(
      <SessionRow
        session={dummySession}
        isActive={false}
        gitBranch="feature/rate-limiting"
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )
    expect(html).toContain('session-git-badge')
    expect(html).toContain('feature/rate-limiting')
  })

  it('does NOT show git branch when project is not a git repo', () => {
    const html = render(
      <SessionRow
        session={dummySession}
        isActive={false}
        gitBranch={null}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )
    expect(html).not.toContain('session-git-badge')
  })

  it('renders the real model name and provider SVG logo', () => {
    const html = render(
      <SessionRow
        session={{ ...dummySession, model: 'anthropic/claude-sonnet', providerId: 'openai-codex' }}
        isActive={false}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )
    expect(html).toContain('claude-sonnet')
    expect(html).toContain('codex-logo')
  })
})
