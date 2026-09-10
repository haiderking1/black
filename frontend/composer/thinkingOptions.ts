import { THINKING_LEVELS } from '../../contracts/providers'
import type { ModelInfo } from '../../contracts/providers'

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

const LABELS: Record<string, string> = {
  default: 'Default',
  off: 'Default',
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max'
}

function labelFor(value: string): string {
  return LABELS[value] ?? value
}

/** The levels offered when a model is not in the catalog and nothing is known. */
export function fallbackChoices(): ThinkingChoice[] {
  const defaultChoice: ThinkingChoice = { value: THINKING_DEFAULT, label: 'Default' }
  const levels = THINKING_LEVELS.filter((value) => value !== 'off').map((value) => ({
    value,
    label: labelFor(value),
  }))
  return [defaultChoice, ...levels]
}

export function thinkingOptionsFor(model: ModelInfo | null): ThinkingOptions {
  const defaultChoice: ThinkingChoice = { value: THINKING_DEFAULT, label: 'Default' }

  if (model === null) {
    return { choices: fallbackChoices(), disabled: false, note: null }
  }

  switch (model.thinkingKind) {
    case 'effort': {
      const levels = (model.thinkingLevels ?? []).filter((value) => value !== '')
      if (levels.length === 0) {
        return {
          choices: [defaultChoice],
          disabled: true,
          note: model.id + ' does not publish a thinking level this client can set.'
        }
      }
      // The vendor's own values, so what is sent is always one it accepts. A
      // vendor value that collides with our sentinel is kept as the vendor's,
      // since sending it is what that vendor asked for.
      const vendorChoices = levels.map((value) => ({ value, label: labelFor(value) }))
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
        note: model.id + ' reasons on or off. This client sets an effort level, so it cannot steer it.'
      }

    case 'none':
      return {
        choices: [defaultChoice],
        disabled: true,
        note: model.id + ' reasons, but exposes no level to set.'
      }

    case 'unknown':
      // Unlisted models: the real support is not published anywhere we can read,
      // so the full set is offered with a warning rather than silently blocked.
      return {
        choices: fallbackChoices(),
        disabled: false,
        note: 'Thinking support is unknown for ' + model.id + '. The value is sent unchecked.'
      }

    default:
      if (model.reasoning === false) {
        return { choices: [defaultChoice], disabled: true, note: model.id + ' does not reason.' }
      }
      return { choices: fallbackChoices(), disabled: false, note: null }
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
