import React from 'react'

import type { LanguagePreference } from '../../../contracts/language'
import { useT } from '../../i18n'
import './language.css'

const OPTIONS: readonly LanguagePreference[] = ['auto', 'en', 'ar']

export function LanguageSettings({
  value,
  onChange,
}: {
  value: LanguagePreference
  onChange: (value: LanguagePreference) => void
}): React.JSX.Element {
  const t = useT()

  return (
    <section className="settings-section" aria-labelledby="language-heading">
      <div className="settings-section-heading">
        <h2 id="language-heading">{t('language.heading')}</h2>
        <p>{t('language.hint')}</p>
      </div>
      <fieldset className="settings-language-options" aria-labelledby="language-heading">
        {OPTIONS.map((option) => (
          <label
            key={option}
            className={'settings-language-option' + (value === option ? ' active' : '')}
            {...(option === 'ar' ? { lang: 'ar' } : option === 'en' ? { lang: 'en' } : {})}
          >
            <input
              type="radio"
              name="language"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span className="settings-row-copy">
              <span className="settings-row-title">
                {option === 'auto' ? t('language.auto') : option === 'en' ? t('language.en') : t('language.ar')}
              </span>
              <span className="settings-row-description">
                {option === 'auto' ? t('language.autoHint') : option === 'en' ? t('language.enHint') : t('language.arHint')}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
