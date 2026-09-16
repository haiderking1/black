import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { LanguageProvider } from '../../frontend/language'
import { Markdown } from '../../frontend/markdown'

function render(source: string, language: 'auto' | 'en' | 'ar' = 'auto'): string {
  return renderToStaticMarkup(
    <LanguageProvider language={language}>
      <Markdown>{source}</Markdown>
    </LanguageProvider>,
  )
}

describe('arabic markdown', () => {
  it('marks Arabic prose rtl and lang=ar', () => {
    const html = render('مرحبا بالعالم')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('lang="ar"')
    expect(html).toContain('مرحبا بالعالم')
  })

  it('keeps English prose ltr', () => {
    const html = render('Hello world')
    expect(html).toContain('dir="ltr"')
    expect(html).toContain('lang="en"')
  })

  it('stays rtl when Arabic wraps a fenced code block', () => {
    const html = render('```ts\nconst x = 1\n```\n\nهذه الدالة ترجع واحد.')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('markdown-code-block')
    expect(html).toContain('dir="ltr"')
    expect(html).toContain('const x = 1')
  })

  it('isolates inline code as ltr inside Arabic', () => {
    const html = render('استخدم `Array.map` هنا.')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('class="markdown-inline-code" dir="ltr"')
    expect(html).toContain('Array.map')
  })

  it('honours a pinned Arabic setting even on English source', () => {
    const html = render('Hello', 'ar')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('lang="ar"')
  })

  it('uses logical list and quote edges so RTL does not indent the wrong side', () => {
    const css = readFileSync(new URL('../../frontend/markdown/markdown.css', import.meta.url), 'utf8')
    expect(css).toContain('padding-inline-start: 22px')
    expect(css).toContain('border-inline-start: 2px solid var(--border-medium)')
    expect(css).toContain("text-align: start")
    expect(css).not.toContain('padding-left: 22px')
    expect(css).not.toContain('border-left: 2px solid')
  })
})
