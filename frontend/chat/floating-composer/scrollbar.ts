/** Width the scroll bar actually occupies, or 0 when it overlays. */
export function scrollbarSize(element: Pick<HTMLElement, 'offsetWidth' | 'clientWidth'>): number {
  const size = element.offsetWidth - element.clientWidth
  return Number.isFinite(size) && size > 0 ? Math.round(size) : 0
}
