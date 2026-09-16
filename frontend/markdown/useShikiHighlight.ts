import { useEffect, useState } from 'react'
import { getCachedHighlighted, highlightCode, normalizeLanguage, resolveShikiTheme } from './highlighter'

export function useShikiHighlight(
  code: string,
  rawLanguage: string,
  appTheme: string,
): { highlightedHtml: string | null } {
  const language = normalizeLanguage(rawLanguage)
  const theme = resolveShikiTheme(appTheme)
  const cacheKey = `${theme}:${language}:${code}`

  // If already in cache, start with it immediately (no flash of raw text)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(() => {
    return getCachedHighlighted(cacheKey) ?? null
  })

  useEffect(() => {
    let cancelled = false
    const cached = getCachedHighlighted(cacheKey)
    if (cached !== undefined) {
      setHighlightedHtml(cached)
      return
    }

    void highlightCode(code, rawLanguage, appTheme).then((html) => {
      if (!cancelled) {
        setHighlightedHtml(html)
      }
    })

    return () => {
      cancelled = true
    }
  }, [cacheKey, code, rawLanguage, appTheme])

  return { highlightedHtml }
}
