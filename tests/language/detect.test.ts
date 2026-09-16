import { describe, expect, it } from 'bun:test'

import { directionFor, hasArabic, inputDirection, langFor, proseForDirection } from '../../frontend/language/detect'

describe('hasArabic', () => {
  it('finds Arabic letters and presentation forms', () => {
    expect(hasArabic('مرحبا')).toBe(true)
    expect(hasArabic('hello')).toBe(false)
    expect(hasArabic('file.ts')).toBe(false)
    expect(hasArabic('السَّلام')).toBe(true)
  })
})

describe('proseForDirection', () => {
  it('drops fenced and inline code so a fence does not count as Latin', () => {
    const source = '```js\nconst n = 1\n```\nهذه فقرة عربية'
    expect(proseForDirection(source)).not.toContain('const')
    expect(proseForDirection(source)).toContain('هذه')
    expect(proseForDirection('استخدم `map` هنا')).not.toContain('map')
  })

  it('drops an unclosed fence so a streaming code block cannot flip Arabic to LTR', () => {
    const source = 'شرح الدالة:\n```ts\nconst veryLongIdentifierName = 1\n'
    expect(proseForDirection(source)).not.toContain('veryLongIdentifierName')
    expect(directionFor('auto', source)).toBe('rtl')
  })
})

describe('directionFor', () => {
  it('pins Arabic and English regardless of the text', () => {
    expect(directionFor('ar', 'Hello')).toBe('rtl')
    expect(directionFor('en', 'مرحبا')).toBe('ltr')
  })

  it('follows the majority script in auto', () => {
    expect(directionFor('auto', 'مرحبا بالعالم')).toBe('rtl')
    expect(directionFor('auto', 'Hello world')).toBe('ltr')
    expect(directionFor('auto', '')).toBe('ltr')
  })

  it('treats Arabic explanation around a code fence as RTL', () => {
    const source = '```ts\nexport const x = 1\n```\n\nالدالة ترجع واحد.'
    expect(directionFor('auto', source)).toBe('rtl')
  })

  it('keeps a mostly English reply LTR when Arabic is only a cited word', () => {
    expect(directionFor('auto', 'The Arabic word مرحبا means hello.')).toBe('ltr')
  })
})

describe('langFor', () => {
  it('matches the resolved direction in auto', () => {
    expect(langFor('auto', 'مرحبا')).toBe('ar')
    expect(langFor('auto', 'Hello')).toBe('en')
    expect(langFor('ar', 'Hello')).toBe('ar')
  })
})

describe('inputDirection', () => {
  it('leaves an empty auto field as auto so the first letter can flip it', () => {
    expect(inputDirection('auto', '')).toBe('auto')
    expect(inputDirection('auto', '   ')).toBe('auto')
  })

  it('pins Arabic on an empty field when Arabic is chosen', () => {
    expect(inputDirection('ar', '')).toBe('rtl')
  })

  it('resolves once there is prose', () => {
    expect(inputDirection('auto', 'مرحبا')).toBe('rtl')
    expect(inputDirection('auto', 'Hello')).toBe('ltr')
  })
})
