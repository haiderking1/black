import { isMessageKey, type MessageKey } from '../../i18n'

/** Provider-specific OAuth copy, falling back to the Codex strings. */
export function oauthCopyKey(base: MessageKey, providerId: string): MessageKey {
  const specific = base + '.' + providerId
  return isMessageKey(specific) ? specific : base
}
