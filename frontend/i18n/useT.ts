import { t, type MessageKey } from './t'
import { useLanguage } from '../language'

export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const language = useLanguage()
  return (key, vars) => t(language, key, vars)
}
