import type { LanguagePreference } from '../../contracts/language'

/**
 * Arabic, Arabic Supplement, Extended-A/B, and presentation forms.
 *
 * Presentation forms matter because some keyboards still emit them, and a
 * detector that only looks at the main block would treat those messages as
 * Latin and flip the page the wrong way.
 */
const ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u0870-\u088F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u

const LATIN = /[A-Za-z\u00C0-\u024F]/u

export function hasArabic(text: string): boolean {
  return ARABIC.test(text)
}

/**
 * Prose used to decide direction.
 *
 * Fenced and inline code are dropped so a reply that starts with a JavaScript
 * fence is not counted as Latin-majority when the explanation around it is
 * Arabic. Markdown punctuation is left in; it has no strong direction.
 */
export function proseForDirection(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*$/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/`[^`]*$/g, ' ')
}

export function directionFor(language: LanguagePreference, text: string): 'rtl' | 'ltr' {
  if (language === 'ar') return 'rtl'
  if (language === 'en') return 'ltr'

  const prose = proseForDirection(text)
  let arabic = 0
  let latin = 0
  for (const char of prose) {
    if (ARABIC.test(char)) arabic += 1
    else if (LATIN.test(char)) latin += 1
  }
  if (arabic === 0) return 'ltr'
  return arabic >= latin ? 'rtl' : 'ltr'
}

export function langFor(language: LanguagePreference, text: string): string {
  if (language === 'ar') return 'ar'
  if (language === 'en') return 'en'
  return directionFor('auto', text) === 'rtl' ? 'ar' : 'en'
}

/**
 * Direction for a live input.
 *
 * Auto with no letters yet stays `auto`, so the first strong character the
 * reader types can still flip the caret. Resolved messages use directionFor,
 * which has to pick a side because a leading code fence would steal first-strong.
 */
export function inputDirection(
  language: LanguagePreference,
  text: string,
): 'rtl' | 'ltr' | 'auto' {
  if (language === 'ar') return 'rtl'
  if (language === 'en') return 'ltr'
  if (text.trim() === '') return 'auto'
  return directionFor('auto', text)
}
