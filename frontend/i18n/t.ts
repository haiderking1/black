import type { LanguagePreference } from '../../contracts/language'

import { ar } from './catalog/ar'
import { en, type MessageKey } from './catalog/en'
import { uiLocale } from './locale'

const catalogs = { en, ar } as const

export type { MessageKey }

export function t(
  language: LanguagePreference,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const locale = uiLocale(language)
  const template = catalogs[locale][key] ?? en[key]
  if (vars === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name]
    return value === undefined ? '' : String(value)
  })
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, value)
}
