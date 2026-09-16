import type { ModelInfo } from '../../contracts/providers'
import type { LanguagePreference } from '../../contracts/language'
import { t } from '../i18n'

/**
 * Thinking choices for a model.
 *
 * Vendors do not agree on what a reasoning level is, and the values are not
 * interchangeable: GLM-5.3 takes low/high/max, Kimi K3 takes max alone, some
 * models take none at all. So the options come from the model's own catalog
 * entry rather than a fixed list, which is what stops the picker offering a
 * value the model would reject.
 *
 * 'default' is always present and means "send no thinking parameter", so the
 * model uses whatever it would use on its own. It is deliberately not called
 * "off": a vendor may offer its own zero value such as 'none', which sends an
 * explicit value and is a different request.
 */

export const THINKING_DEFAULT = 'default'

export interface ThinkingChoice {
  value: string
  label: string
}

export interface ThinkingOptions {
  choices: ThinkingChoice[]
  /** True when the model exposes nothing this client can set. */
  disabled: boolean
  /** Why the picker is limited, shown under the list. */
  note: string | null
}

function labelFor(value: string, language: LanguagePreference): string {
  switch (value) {
    case 'default':
    case 'off':
      return t(language, 'thinking.default')
    case 'none':
      return t(language, 'thinking.none')
    case 'minimal':
      return t(language, 'thinking.minimal')
    case 'low':
      return t(language, 'thinking.low')
    case 'medium':
      return t(language, 'thinking.medium')
    case 'high':
      return t(language, 'thinking.high')
    case 'xhigh':
      return t(language, 'thinking.xhigh')
    case 'max':
      return t(language, 'thinking.max')
    default:
      return value
  }
}

/** The levels offered when a model is not in the catalog and nothing is known. */
export function fallbackChoices(language: LanguagePreference = 'auto'): ThinkingChoice[] {
  const defaultChoice: ThinkingChoice = { value: THINKING_DEFAULT, label: t(language, 'thinking.default') }
  return [defaultChoice]
}

export function thinkingOptionsFor(
  model: ModelInfo | null,
  language: LanguagePreference = 'auto',
): ThinkingOptions {
  const defaultChoice: ThinkingChoice = { value: THINKING_DEFAULT, label: t(language, 'thinking.default') }

  if (model === null) {
    return { choices: fallbackChoices(language), disabled: true, note: t(language, 'thinking.note.unavailable') }
  }

  switch (model.thinkingKind) {
    case 'effort': {
      const levels = (model.thinkingLevels ?? []).filter((value) => value !== '')
      if (levels.length === 0) {
        return {
          choices: [defaultChoice],
          disabled: true,
          note: t(language, 'thinking.note.noLevels', { model: model.id }),
        }
      }
      // The vendor's own values, so what is sent is always one it accepts. A
      // vendor value that collides with our sentinel is kept as the vendor's,
      // since sending it is what that vendor asked for.
      const vendorChoices = levels.map((value) => ({ value, label: labelFor(value, language) }))
      const hasDefault = levels.includes(THINKING_DEFAULT) || levels.includes('off')
      return {
        choices: hasDefault ? vendorChoices : [defaultChoice, ...vendorChoices],
        disabled: false,
        note: null,
      }
    }

    case 'toggle':
      return {
        choices: [defaultChoice],
        disabled: true,
        note: t(language, 'thinking.note.toggle', { model: model.id }),
      }

    case 'none':
      return {
        choices: [defaultChoice],
        disabled: true,
        note: t(language, 'thinking.note.none', { model: model.id }),
      }

    case 'unknown':
      return {
        choices: fallbackChoices(language),
        disabled: true,
        note: t(language, 'thinking.note.unknown', { model: model.id }),
      }

    default:
      if (model.reasoning === false) {
        return {
          choices: [defaultChoice],
          disabled: true,
          note: t(language, 'thinking.note.noReason', { model: model.id }),
        }
      }
      return {
        choices: fallbackChoices(language),
        disabled: true,
        note: t(language, 'thinking.note.unavailable'),
      }
  }
}

/**
 * The nearest supported level to the one requested.
 *
 * Called when the selected model changes: a level valid for the previous model
 * is usually invalid for the next one, and sending it would be rejected.
 */
export function clampThinkingLevel(level: string, choices: ThinkingChoice[]): string {
  if (choices.length === 0) return THINKING_DEFAULT
  if (choices.some((choice) => choice.value === level)) return level

  // Settings saved before the sentinel was renamed still say 'off'. That maps
  // onto the new sentinel rather than being clamped into a real level, which
  // would start reasoning for someone who had asked for none.
  if (level === 'off') return THINKING_DEFAULT

  // Prefer a middle default when the model takes one, so a clamp does not
  // silently make every model reason at its maximum.
  const preferred = choices.find((choice) => choice.value === 'medium')
  if (preferred !== undefined) return preferred.value

  const firstLevel = choices.find(
    (choice) => choice.value !== THINKING_DEFAULT && choice.value !== 'off'
  )
  return firstLevel?.value ?? THINKING_DEFAULT
}
