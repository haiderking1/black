import { createFileTreeIconResolver, type FileTreeIcons } from '@pierre/trees'
import { CUSTOM_FILE_ICON_SPRITE } from './sprite'
import type { EntryKind, PierreIconResolution } from './types'

export const VIDEO_FILE_EXTENSIONS = [
  'avi',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'ogv',
  'webm',
] as const

export const BLACK_PIERRE_ICONS = {
  set: 'complete',
  colored: true,
  spriteSheet: CUSTOM_FILE_ICON_SPRITE,
  byFileName: {
    'package.json': 'file-tree-builtin-npm',
    'tsconfig.json': 'file-tree-builtin-typescript',
    'agents.md': 'custom-file-icon-agents',
    'pnpm-lock.yaml': 'custom-file-icon-pnpm',
    'pnpm-workspace.yaml': 'custom-file-icon-pnpm',
  },
  byFileExtension: Object.fromEntries(
    VIDEO_FILE_EXTENSIONS.map((extension) => [extension, 'custom-file-icon-video'])
  ),
} satisfies FileTreeIcons

const completeIconResolver = createFileTreeIconResolver(BLACK_PIERRE_ICONS)

const LANGUAGE_EXTENSION_ALIASES: Record<string, string> = {
  bash: 'sh',
  csharp: 'cs',
  dockerfile: 'dockerfile',
  javascript: 'js',
  jsx: 'jsx',
  markdown: 'md',
  mdx: 'mdx',
  plaintext: 'txt',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  shell: 'sh',
  shellscript: 'sh',
  swift: 'swift',
  typescript: 'ts',
  tsx: 'tsx',
  yaml: 'yml',
  zsh: 'sh',
  golang: 'go',
  sql: 'sql',
}

export function basenameOfPath(pathValue: string): string {
  const slashIndex = pathValue.lastIndexOf('/')
  return slashIndex === -1 ? pathValue : pathValue.slice(slashIndex + 1)
}

export function inferEntryKindFromPath(pathValue: string): EntryKind {
  const base = basenameOfPath(pathValue)
  if (base.startsWith('.') && !base.slice(1).includes('.')) return 'directory'
  return base.includes('.') ? 'file' : 'directory'
}

export function syntheticFileNameForLanguageId(languageId: string): string {
  const normalized = languageId.trim().toLowerCase()
  if (normalized === 'dockerfile' || normalized === 'docker') {
    return 'Dockerfile'
  }
  const extension = LANGUAGE_EXTENSION_ALIASES[normalized] ?? normalized
  return `file.${extension}`
}

export function resolvePierreIconForEntry(
  pathValue: string,
  kind: EntryKind = 'file',
): PierreIconResolution | null {
  if (kind === 'directory') return null
  return completeIconResolver.resolveIcon('file-tree-icon-file', pathValue)
}

export function hasSpecificPierreIconForFileName(fileName: string): boolean {
  return resolvePierreIconForEntry(fileName, 'file')?.token !== 'default'
}
