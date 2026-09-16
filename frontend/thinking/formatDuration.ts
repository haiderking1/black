import type { LanguagePreference } from '../../contracts/language'
import { t } from '../i18n'

/**
 * How long reasoning took, phrased for a collapsed header.
 *
 * Sub-second reasoning is reported as a second rather than as a fraction: the
 * number decorates a disclosure control, and "0.4s" is noise.
 */
export function formatThinkingDuration(ms: number, language: LanguagePreference = 'auto'): string {
  if (!Number.isFinite(ms) || ms < 0) return t(language, 'duration.moment')

  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return t(language, 'duration.seconds', { n: seconds })

  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0
    ? t(language, 'duration.minutes', { n: minutes })
    : t(language, 'duration.minutesSeconds', { m: minutes, s: rest })
}

/** The header label for a reasoning block. */
export function thinkingLabel(
  isStreaming: boolean,
  durationMs: number | undefined,
  language: LanguagePreference = 'auto',
): string {
  if (isStreaming) return t(language, 'thinking.streaming')
  if (durationMs === undefined) return t(language, 'thinking.done')
  return t(language, 'thinking.for', { duration: formatThinkingDuration(durationMs, language) })
}
