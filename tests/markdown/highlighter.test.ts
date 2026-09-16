import { describe, expect, it } from 'bun:test'

import {
  getCachedHighlighted,
  highlightCode,
  normalizeLanguage,
  resolveShikiTheme,
  setCachedHighlighted,
} from '../../frontend/markdown/highlighter'

describe('highlighter', () => {
  it('maps application themes to Shiki bundled themes', () => {
    expect(resolveShikiTheme('dark')).toBe('github-dark')
    expect(resolveShikiTheme('light')).toBe('github-light')
    expect(resolveShikiTheme('gruvbox')).toBe('gruvbox-dark-medium')
    expect(resolveShikiTheme('catppuccin-mocha')).toBe('catppuccin-mocha')
    expect(resolveShikiTheme('rose-pine')).toBe('rose-pine')
    expect(resolveShikiTheme('jellybeans')).toBe('vitesse-dark')
    expect(resolveShikiTheme('unknown-theme')).toBe('github-dark')
  })

  it('normalizes common language aliases', () => {
    expect(normalizeLanguage('js')).toBe('javascript')
    expect(normalizeLanguage('ts')).toBe('typescript')
    expect(normalizeLanguage('py')).toBe('python')
    expect(normalizeLanguage('rs')).toBe('rust')
    expect(normalizeLanguage('sh')).toBe('bash')
    expect(normalizeLanguage('shell')).toBe('bash')
    expect(normalizeLanguage('zsh')).toBe('bash')
    expect(normalizeLanguage('yml')).toBe('yaml')
    expect(normalizeLanguage('md')).toBe('markdown')
    expect(normalizeLanguage('golang')).toBe('go')
    expect(normalizeLanguage('docker')).toBe('dockerfile')
    expect(normalizeLanguage('')).toBe('text')
    expect(normalizeLanguage(undefined)).toBe('text')
  })

  it('highlights TypeScript code into html with tokens', async () => {
    const html = await highlightCode('const x: number = 42', 'ts', 'dark')
    expect(html).toContain('<pre class="shiki github-dark"')
    expect(html).toContain('const')
    expect(html).toContain('42')
  })

  it('safely handles unsupported language names by falling back to text', async () => {
    const html = await highlightCode('some arbitrary text', 'nonexistent-lang-xyz', 'dark')
    expect(html).toContain('<pre class="shiki github-dark"')
    expect(html).toContain('some arbitrary text')
  })

  it('stores and retrieves cached highlighted html', () => {
    const key = 'test-cache-key'
    const value = '<pre>cached-output</pre>'
    setCachedHighlighted(key, value)
    expect(getCachedHighlighted(key)).toBe(value)
  })
})
