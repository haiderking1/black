import React, { createContext, useContext, type ReactNode } from 'react'

import type { LanguagePreference } from '../../contracts/language'

const LanguageContext = createContext<LanguagePreference>('auto')

export function LanguageProvider({
  language,
  children,
}: {
  language: LanguagePreference
  children: ReactNode
}): React.JSX.Element {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguagePreference {
  return useContext(LanguageContext)
}
