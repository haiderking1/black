import { useEffect, useState } from 'react'

/**
 * Returns the currently active application theme by observing the root document element.
 * Defaults safely to 'dark' in non-browser or test environments.
 */
export function useAppTheme(): string {
  const [theme, setTheme] = useState<string>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.dataset['theme'] ?? 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setTheme(root.dataset['theme'] ?? 'dark')
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
