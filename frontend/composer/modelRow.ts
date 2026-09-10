import type { ModelInfo } from '../../contracts/providers'

/** How many rows carry a keyboard shortcut. */
export const SHORTCUT_COUNT = 9

/**
 * The family a model id belongs to.
 *
 * Taken from the id rather than a table of vendors. Those tables go stale the
 * day a vendor ships something new; this reads the name the catalog returned.
 */
export function familyOf(id: string): string {
  const head = id.split(/[-_.]/)[0] ?? ''
  return head === '' ? id : head
}

/** The shortcut a row carries, or null for rows past the bound ones. */
export function shortcutLabel(index: number): string | null {
  return index < SHORTCUT_COUNT ? 'Ctrl+' + (index + 1) : null
}

export interface ModelGroups {
  /** Models the limits catalog knows. */
  primary: readonly ModelInfo[]
  /** Models it does not, so no thinking parameter is ever sent for them. */
  unlisted: readonly ModelInfo[]
}

/**
 * Split the catalog into what black can configure and what it cannot.
 *
 * The unlisted half is folded away rather than hidden. It is a real distinction
 * worth drawing, but folding it must never lose a model, so the count is shown
 * on the group and a search looks through both halves.
 */
export function groupModels(models: readonly ModelInfo[]): ModelGroups {
  const primary: ModelInfo[] = []
  const unlisted: ModelInfo[] = []

  for (const model of models) {
    if (model.thinkingKind === undefined || model.thinkingKind === 'unknown') unlisted.push(model)
    else primary.push(model)
  }

  return { primary, unlisted }
}

/**
 * Models matching a query.
 *
 * Searches the family as well as the id, so a vendor name finds its models even
 * though none of them is called just that. Runs over the whole catalog, so a
 * folded group cannot hide a match.
 */
export function filterModels(models: readonly ModelInfo[], query: string): readonly ModelInfo[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return models

  return models.filter(
    (model) =>
      model.id.toLowerCase().includes(needle) || familyOf(model.id).toLowerCase().includes(needle)
  )
}
