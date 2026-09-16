import { describe, expect, it } from 'bun:test'

import { languagePolicy, withLanguagePolicy } from '../../backend/chat/language'

describe('languagePolicy', () => {
  it('asks auto to follow the user, including Arabic punctuation', () => {
    const policy = languagePolicy('auto')
    expect(policy).toContain('Reply in the language the user is writing in.')
    expect(policy).toContain('؟')
    expect(policy).toContain('،')
  })

  it('pins Modern Standard Arabic and keeps code in its original script', () => {
    const policy = languagePolicy('ar')
    expect(policy).toContain('Write in Arabic.')
    expect(policy).toContain('الفصحى')
    expect(policy).toContain('untranslated unless asked')
  })

  it('pins English without dropping the code rule', () => {
    expect(languagePolicy('en')).toContain('Write in English')
    expect(languagePolicy('en')).toContain('original script')
  })
})

describe('withLanguagePolicy', () => {
  it('appends onto standing policy rather than replacing it', () => {
    const combined = withLanguagePolicy('<runtime_policy>Keep secrets.</runtime_policy>', 'ar')
    expect(combined.startsWith('<runtime_policy>Keep secrets.</runtime_policy>')).toBe(true)
    expect(combined).toContain('Write in Arabic.')
  })

  it('treats a missing or junk value as auto', () => {
    expect(withLanguagePolicy('', undefined)).toBe(languagePolicy('auto'))
    expect(withLanguagePolicy('', 'fr')).toBe(languagePolicy('auto'))
  })
})
