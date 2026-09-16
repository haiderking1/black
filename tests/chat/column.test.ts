import { expect, test } from 'bun:test'

test('transcript and composer share one column token and one gutter', async () => {
  const [column, composer, queued, floating, app] = await Promise.all([
    Bun.file('frontend/chat/column.css').text(),
    Bun.file('frontend/composer/composer.css').text(),
    Bun.file('frontend/composer/queued.css').text(),
    Bun.file('frontend/chat/floating-composer/floating-composer.css').text(),
    Bun.file('frontend/App.tsx').text(),
  ])

  expect(column).toMatch(/--chat-column:\s*800px/)
  expect(column).toMatch(/--chat-gutter:\s*16px/)
  expect(app).toContain('chat-column chat-transcript')
  expect(app).not.toContain("maxWidth: '800px'")
  expect(composer).toContain('max-width: var(--chat-column)')
  expect(composer).not.toMatch(/padding:\s*0\s+16px/)
  expect(queued).toContain('max-width: var(--chat-column)')
  expect(queued).not.toMatch(/padding:\s*0\s+16px/)
  expect(floating.match(/padding: 0 var\(--chat-gutter\)/g)?.length).toBeGreaterThanOrEqual(2)
  expect(floating).toContain('scrollbar-gutter: stable')
  expect(floating).toContain('right: var(--chat-scrollbar)')
})
