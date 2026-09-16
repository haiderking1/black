import type { LanguagePreference } from '../../contracts/language'

/** Chrome locale. Auto keeps menus in English; chat still follows the message. */
export function uiLocale(language: LanguagePreference): 'en' | 'ar' {
  return language === 'ar' ? 'ar' : 'en'
}

export function uiDir(language: LanguagePreference): 'ltr' | 'rtl' {
  return uiLocale(language) === 'ar' ? 'rtl' : 'ltr'
}

export function uiLang(language: LanguagePreference): 'en' | 'ar' {
  return uiLocale(language)
}
