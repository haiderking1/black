import * as Schema from 'effect/Schema'

/**
 * How Black should write, lay out, and label the app.
 *
 * Auto follows each chat message and keeps menus in English. English and Arabic
 * pin the whole interface, including direction, and the model's reply language.
 */
export const LANGUAGE_PREFERENCES = ['auto', 'en', 'ar'] as const
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number]

export const Language = Schema.Literals(['auto', 'en', 'ar'])

export function parseLanguage(value: unknown): LanguagePreference {
  return typeof value === 'string' && (LANGUAGE_PREFERENCES as readonly string[]).includes(value)
    ? (value as LanguagePreference)
    : 'auto'
}
