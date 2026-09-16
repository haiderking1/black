import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  PierreEntryIcon,
  getIconColor,
  hasSpecificPierreIconForFileName,
  inferEntryKindFromPath,
  resolvePierreIconForEntry,
  syntheticFileNameForLanguageId,
} from '../../frontend/icons/pierre'
import { extractFenceTitle } from '../../frontend/markdown/meta'

describe('Pierre icon resolver', () => {
  it('resolves common language extensions to Pierre built-in tokens', () => {
    expect(resolvePierreIconForEntry('main.rs')?.token).toBe('rust')
    expect(resolvePierreIconForEntry('script.sh')?.token).toBe('bash')
    expect(resolvePierreIconForEntry('app.py')?.token).toBe('python')
    expect(resolvePierreIconForEntry('index.ts')?.token).toBe('typescript')
    expect(resolvePierreIconForEntry('Component.tsx')?.token).toBe('react')
    expect(resolvePierreIconForEntry('index.js')?.token).toBe('javascript')
    expect(resolvePierreIconForEntry('Component.jsx')?.token).toBe('react')
    expect(resolvePierreIconForEntry('styles.css')?.token).toBe('css')
    expect(resolvePierreIconForEntry('index.html')?.token).toBe('html')
    expect(resolvePierreIconForEntry('data.json')?.token).toBe('json')
    expect(resolvePierreIconForEntry('config.yaml')?.token).toBe('yml')
    expect(resolvePierreIconForEntry('config.yml')?.token).toBe('yml')
    expect(resolvePierreIconForEntry('main.go')?.token).toBe('go')
    expect(resolvePierreIconForEntry('gem.rb')?.token).toBe('ruby')
    expect(resolvePierreIconForEntry('App.swift')?.token).toBe('swift')
    expect(resolvePierreIconForEntry('main.zig')?.token).toBe('zig')
    expect(resolvePierreIconForEntry('schema.sql')?.token).toBe('database')
    expect(resolvePierreIconForEntry('module.wasm')?.token).toBe('wasm')
    expect(resolvePierreIconForEntry('README.md')?.token).toBe('markdown')
  })

  it('resolves exact filenames and custom extended icons', () => {
    expect(resolvePierreIconForEntry('Dockerfile')?.token).toBe('docker')
    expect(resolvePierreIconForEntry('package.json')?.name).toBe('file-tree-builtin-npm')
    expect(resolvePierreIconForEntry('tsconfig.json')?.name).toBe('file-tree-builtin-typescript')
    expect(resolvePierreIconForEntry('agents.md')?.name).toBe('custom-file-icon-agents')
    expect(resolvePierreIconForEntry('pnpm-lock.yaml')?.name).toBe('custom-file-icon-pnpm')
    expect(resolvePierreIconForEntry('clip.mp4')?.name).toBe('custom-file-icon-video')
  })

  it('maps language identifiers to synthetic filenames', () => {
    expect(syntheticFileNameForLanguageId('rust')).toBe('file.rs')
    expect(syntheticFileNameForLanguageId('rs')).toBe('file.rs')
    expect(syntheticFileNameForLanguageId('sh')).toBe('file.sh')
    expect(syntheticFileNameForLanguageId('bash')).toBe('file.sh')
    expect(syntheticFileNameForLanguageId('zsh')).toBe('file.sh')
    expect(syntheticFileNameForLanguageId('python')).toBe('file.py')
    expect(syntheticFileNameForLanguageId('py')).toBe('file.py')
    expect(syntheticFileNameForLanguageId('typescript')).toBe('file.ts')
    expect(syntheticFileNameForLanguageId('ts')).toBe('file.ts')
    expect(syntheticFileNameForLanguageId('tsx')).toBe('file.tsx')
    expect(syntheticFileNameForLanguageId('javascript')).toBe('file.js')
    expect(syntheticFileNameForLanguageId('js')).toBe('file.js')
    expect(syntheticFileNameForLanguageId('jsx')).toBe('file.jsx')
    expect(syntheticFileNameForLanguageId('dockerfile')).toBe('Dockerfile')
    expect(syntheticFileNameForLanguageId('docker')).toBe('Dockerfile')
    expect(syntheticFileNameForLanguageId('sql')).toBe('file.sql')
    expect(syntheticFileNameForLanguageId('markdown')).toBe('file.md')
  })

  it('differentiates specific icons from default fallback', () => {
    expect(hasSpecificPierreIconForFileName('main.rs')).toBe(true)
    expect(hasSpecificPierreIconForFileName('unknown.xyzabc')).toBe(false)
  })

  it('leaves directory rendering to folder fallback', () => {
    expect(resolvePierreIconForEntry('src/components', 'directory')).toBeNull()
    expect(inferEntryKindFromPath('src/components')).toBe('directory')
    expect(inferEntryKindFromPath('src/main.rs')).toBe('file')
  })

  it('provides light and dark theme colors for tokens', () => {
    const rustLight = getIconColor('rust', 'light')
    const rustDark = getIconColor('rust', 'dark')
    expect(rustLight).toBe('#d47628')
    expect(rustDark).toBe('#ffa359')

    const bashLight = getIconColor('bash', 'light')
    const bashDark = getIconColor('bash', 'dark')
    expect(bashLight).toBe('#199f43')
    expect(bashDark).toBe('#5ecc71')
  })
})

describe('PierreEntryIcon component', () => {
  it('renders SVG with symbol reference and token color for rust', () => {
    const html = renderToStaticMarkup(
      <PierreEntryIcon pathValue="file.rs" kind="file" theme="dark" />
    )
    expect(html).toContain('data-pierre-icon="file-tree-builtin-rust"')
    expect(html).toContain('data-icon-token="rust"')
    expect(html).toContain('href="#file-tree-builtin-rust"')
    expect(html).toContain('color:#ffa359')
  })

  it('renders SVG with symbol reference and token color for bash', () => {
    const html = renderToStaticMarkup(
      <PierreEntryIcon pathValue="file.sh" kind="file" theme="dark" />
    )
    expect(html).toContain('data-pierre-icon="file-tree-builtin-bash"')
    expect(html).toContain('data-icon-token="bash"')
    expect(html).toContain('href="#file-tree-builtin-bash"')
    expect(html).toContain('color:#5ecc71')
  })

  it('switches token color when light theme is selected', () => {
    const html = renderToStaticMarkup(
      <PierreEntryIcon pathValue="file.rs" kind="file" theme="light" />
    )
    expect(html).toContain('color:#d47628')
  })
})

describe('extractFenceTitle', () => {
  it('extracts bare filename tokens', () => {
    expect(extractFenceTitle('main.rs')).toBe('main.rs')
    expect(extractFenceTitle('src/index.ts')).toBe('src/index.ts')
    expect(extractFenceTitle('Cargo.toml')).toBe('Cargo.toml')
  })

  it('extracts title="..." attributes', () => {
    expect(extractFenceTitle('title="main.rs"')).toBe('main.rs')
    expect(extractFenceTitle('filename="src/App.tsx"')).toBe('src/App.tsx')
    expect(extractFenceTitle('file="config.json"')).toBe('config.json')
  })

  it('returns null when no filename is present', () => {
    expect(extractFenceTitle(undefined)).toBeNull()
    expect(extractFenceTitle('')).toBeNull()
    expect(extractFenceTitle('nowrap')).toBeNull()
  })
})
