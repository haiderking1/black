/**
 * A key that should go into the search field.
 *
 * Arrows, Enter, Escape, and Backspace are navigation. A modified key is a
 * shortcut. Everything else with a single character is type-to-search, even
 * when the input is not the event target.
 */
export function isSearchTextKey(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing: boolean
}): boolean {
  if (event.isComposing || event.key === 'Process') return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  return event.key.length === 1
}

/**
 * The next highlighted row after an arrow key.
 *
 * Null means nothing is highlighted yet: Down starts at the first row, Up at
 * the last. Out-of-range values clamp rather than wrapping, so holding an
 * arrow stops at the end instead of jumping to the other side.
 */
export function nextIndex(current: number | null, delta: 1 | -1, count: number): number | null {
  if (count <= 0) return null
  const last = count - 1
  if (current === null) return delta === 1 ? 0 : last
  return Math.max(0, Math.min(current + delta, last))
}

/**
 * A highlight that still points at a row after the list shrank.
 *
 * Search can drop rows under the cursor. Enter and the selected class should
 * land on the last remaining row rather than on a hole.
 */
export function clampIndex(current: number | null, count: number): number | null {
  if (count <= 0 || current === null) return null
  return Math.max(0, Math.min(current, count - 1))
}

/**
 * Which row to highlight after the query changes.
 *
 * An empty query keeps Local folder first. A query that still shows that row
 * plus real projects skips it, so typing a project name and pressing Enter
 * opens the project rather than the folder browser.
 */
export function firstSearchIndex(
  query: string,
  localFolderVisible: boolean,
  projectCount: number,
): number {
  if (query.trim() === '') return 0
  if (localFolderVisible && projectCount > 0) return 1
  return 0
}

export type BackspaceAction = 'edit' | 'leave' | 'ignore'

/**
 * What Backspace should do in the picker.
 *
 * The field value is the live input, not React state. Keydown runs before
 * the character is deleted, so an empty React query with text still in the
 * box must edit, not leave. Key-repeat after the last character would
 * otherwise walk up past home.
 */
export function backspaceAction(input: {
  fieldValue: string
  repeat: boolean
  composing: boolean
}): BackspaceAction {
  if (input.composing) return 'ignore'
  if (input.fieldValue.length > 0) return 'edit'
  if (input.repeat) return 'ignore'
  return 'leave'
}
