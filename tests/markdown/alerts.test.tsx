import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { remarkGithubAlerts } from '../../frontend/markdown/alerts'

function render(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkGithubAlerts]}>{markdown}</ReactMarkdown>
  )
}

describe('remarkGithubAlerts', () => {
  it('tags a quote whose first line is [!NOTE] and drops the marker line', () => {
    const html = render('> [!NOTE]\n> The content of the note.')
    expect(html).toContain('data-alert="note"')
    expect(html).not.toContain('[!NOTE]')
    expect(html).toContain('The content of the note.')
  })

  it('tags a quote with [!TIP], [!IMPORTANT], [!WARNING], and [!CAUTION]', () => {
    expect(render('> [!TIP]\n> Helpful tip.')).toContain('data-alert="tip"')
    expect(render('> [!important]\n> High priority.')).toContain('data-alert="important"')
    expect(render('> [!WARNING]\n> Watch out.')).toContain('data-alert="warning"')
    expect(render('> [!CAUTION]\n> Dangerous action.')).toContain('data-alert="caution"')
  })

  it('keeps content that follows a marker-only paragraph', () => {
    const html = render('> [!WARNING]\n>\n> ### Heading\n>\n> Paragraph text.')
    expect(html).toContain('data-alert="warning"')
    expect(html).not.toContain('[!WARNING]')
    expect(html).toContain('Heading</h3>')
    expect(html).toContain('Paragraph text.')
  })

  it('tags a quote whose next line opens with an inline tag', () => {
    const html = render('> [!NOTE]\n> **Critical:** Verify the migration.')
    expect(html).toContain('data-alert="note"')
    expect(html).not.toContain('[!NOTE]')
    expect(html).toContain('<strong>Critical:</strong>')
    expect(html).toContain('Verify the migration.')
  })

  it('leaves a quote alone when the marker shares its line with text', () => {
    const html = render('> [!NOTE] inline note text')
    expect(html).not.toContain('data-alert')
    expect(html).toContain('[!NOTE] inline note text')
  })

  it('leaves unrecognized markers as literal text', () => {
    const html = render('> [!UNKNOWN]\n> Some text.')
    expect(html).not.toContain('data-alert')
    expect(html).toContain('[!UNKNOWN]')
  })
})
