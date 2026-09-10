/** Resize-driven following must not move content the reader is inspecting. */
export function isInspectingWork(container: HTMLElement): boolean {
  const document = container.ownerDocument
  const focused = document.activeElement
  if (focused instanceof Element && container.contains(focused) && focused.closest('[data-working]')) return true
  if (container.querySelector('[data-working]:hover')) return true
  const selection = document.getSelection()
  return selection !== null && !selection.isCollapsed && selection.anchorNode !== null && container.contains(selection.anchorNode)
}
