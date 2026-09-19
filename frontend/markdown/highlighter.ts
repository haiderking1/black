import { createHighlighter, type BundledLanguage, type BundledTheme, type HighlighterGeneric } from 'shiki'

export type ShikiHighlighter = HighlighterGeneric<BundledLanguage, BundledTheme>

const THEMES: BundledTheme[] = [
  'github-dark',
  'github-light',
  'gruvbox-dark-medium',
  'catppuccin-mocha',
  'rose-pine',
  'vitesse-dark',
]

const INITIAL_LANGUAGES: BundledLanguage[] = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'python',
  'bash',
  'html',
  'css',
  'sql',
  'markdown',
  'yaml',
  'rust',
  'go',
  'diff',
]

const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  golang: 'go',
  docker: 'dockerfile',
}

export function resolveShikiTheme(appTheme: string): BundledTheme {
  switch (appTheme) {
    case 'light':
      return 'github-light'
    case 'gruvbox':
      return 'gruvbox-dark-medium'
    case 'catppuccin-mocha':
      return 'catppuccin-mocha'
    case 'rose-pine':
      return 'rose-pine'
    case 'jellybeans':
      return 'vitesse-dark'
    case 'dark':
    default:
      return 'github-dark'
  }
}

export function normalizeLanguage(lang: string | undefined): string {
  if (!lang) return 'text'
  const clean = lang.trim().toLowerCase()
  if (clean === '') return 'text'
  return LANGUAGE_ALIASES[clean] ?? clean
}

let highlighterPromise: Promise<ShikiHighlighter> | null = null

export function getHighlighter(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    const promise = createHighlighter({
      themes: THEMES,
      langs: INITIAL_LANGUAGES,
    }).catch((err) => {
      highlighterPromise = null
      throw err
    })
    highlighterPromise = promise
    return promise
  }
  return highlighterPromise
}

/** Cache for highlighted HTML strings to avoid re-tokenizing during re-renders. */
const MAX_CACHE_SIZE = 500
const highlightCache = new Map<string, string>()

export function getCachedHighlighted(cacheKey: string): string | undefined {
  return highlightCache.get(cacheKey)
}

export function setCachedHighlighted(cacheKey: string, html: string): void {
  if (highlightCache.size >= MAX_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value
    if (firstKey !== undefined) {
      highlightCache.delete(firstKey)
    }
  }
  highlightCache.set(cacheKey, html)
}

export async function highlightCode(
  code: string,
  rawLanguage: string,
  appTheme: string,
): Promise<string> {
  const language = normalizeLanguage(rawLanguage)
  const theme = resolveShikiTheme(appTheme)
  const cacheKey = `${theme}:${language}:${code}`

  const cached = getCachedHighlighted(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const highlighter = await getHighlighter()
  const loadedLangs = new Set(highlighter.getLoadedLanguages())

  let effectiveLang: string = language
  if (language !== 'text' && !loadedLangs.has(language)) {
    try {
      await highlighter.loadLanguage(language as BundledLanguage)
    } catch {
      // Unsupported language: fall back to plain text
      effectiveLang = 'text'
    }
  }

  try {
    const html = highlighter.codeToHtml(code, {
      lang: effectiveLang,
      theme,
    })
    setCachedHighlighted(cacheKey, html)
    return html
  } catch {
    // If syntax highlighting throws unexpectedly, fall back to plain text
    const plainHtml = highlighter.codeToHtml(code, {
      lang: 'text',
      theme,
    })
    setCachedHighlighted(cacheKey, plainHtml)
    return plainHtml
  }
}
