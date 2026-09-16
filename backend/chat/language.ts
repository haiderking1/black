import { parseLanguage, type LanguagePreference } from '../../contracts/language'

const MATCH_USER = [
  'Reply in the language the user is writing in.',
  'If they write Arabic, reply in Arabic. Match their register: dialect if they use a dialect, Modern Standard otherwise.',
  'Use Arabic punctuation in Arabic prose: ؟ for questions, ، for commas, ؛ for semicolons.',
  'Keep code, commands, identifiers, file paths, URLs, and quoted logs in their original script.',
].join(' ')

const ENGLISH = [
  'Write in English unless a quoted snippet or identifier must stay in another language.',
  'Keep code, commands, paths, and logs in their original script.',
].join(' ')

const ARABIC = [
  'Write in Arabic.',
  'Default to Modern Standard Arabic (الفصحى). If the user is writing in a dialect, match that dialect.',
  'Use Arabic punctuation in Arabic prose: ؟ for questions, ، for commas, ؛ for semicolons. Do not substitute Latin ? , ; in Arabic sentences.',
  'Keep code, commands, identifiers, file paths, URLs, and quoted logs in their original script and in their original order, untranslated unless asked.',
  'When an Arabic sentence names a Latin identifier, keep the identifier intact.',
].join(' ')

export function languagePolicy(language: LanguagePreference): string {
  if (language === 'en') return ENGLISH
  if (language === 'ar') return ARABIC
  return MATCH_USER
}

/** Append the reply-language rule onto standing policy without dropping either. */
export function withLanguagePolicy(policy: string, language: unknown): string {
  const lang = languagePolicy(parseLanguage(language))
  if (policy === '') return lang
  return policy + '\n\n' + lang
}
