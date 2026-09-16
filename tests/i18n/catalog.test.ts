import { describe, expect, it } from 'bun:test'

import { ar } from '../../frontend/i18n/catalog/ar'
import { en, type MessageKey } from '../../frontend/i18n/catalog/en'
import { t } from '../../frontend/i18n/t'
import { uiDir, uiLang, uiLocale } from '../../frontend/i18n/locale'

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!)
}

describe('i18n catalogs', () => {
  it('covers every English key in Arabic', () => {
    const englishKeys = Object.keys(en).sort()
    const arabicKeys = Object.keys(ar).sort()
    expect(arabicKeys).toEqual(englishKeys)
  })

  it('keeps every Arabic string non-empty', () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(ar[key].length).toBeGreaterThan(0)
    }
  })

  it('keeps the same placeholders in both catalogs', () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(placeholders(ar[key]).sort()).toEqual(placeholders(en[key]).sort())
    }
  })
})

describe('t', () => {
  it('returns English chrome for Auto and English', () => {
    expect(t('auto', 'settings.back')).toBe('Back')
    expect(t('en', 'settings.back')).toBe('Back')
    expect(t('auto', 'composer.send')).toBe('Send message')
  })

  it('returns Arabic chrome when Arabic is pinned', () => {
    expect(t('ar', 'settings.back')).toBe('رجوع')
    expect(t('ar', 'composer.send')).toBe('إرسال الرسالة')
    expect(t('ar', 'sidebar.newChat')).toBe('محادثة جديدة')
  })

  it('interpolates variables in both catalogs', () => {
    expect(t('en', 'sidebar.rename', { title: 'Fix timer' })).toBe('Rename Fix timer')
    expect(t('ar', 'sidebar.rename', { title: 'Fix timer' })).toBe('إعادة تسمية Fix timer')
    expect(t('ar', 'compact.tokens', { n: '12k' })).toBe('12k رمز')
  })
})

describe('ui locale', () => {
  it('pins Arabic chrome and direction only when language is ar', () => {
    expect(uiLocale('ar')).toBe('ar')
    expect(uiLang('ar')).toBe('ar')
    expect(uiDir('ar')).toBe('rtl')
  })

  it('keeps Auto and English menus left to right', () => {
    expect(uiLocale('auto')).toBe('en')
    expect(uiLocale('en')).toBe('en')
    expect(uiDir('auto')).toBe('ltr')
    expect(uiDir('en')).toBe('ltr')
  })
})
