import { isAtBottom } from '../scrollGeometry'

export interface TranscriptPosition {
  readonly itemKey: string
  readonly itemIndex: number
  /** The row's top edge relative to the scrollport's top edge. */
  readonly offset: number
  readonly scrollTop: number
  readonly atBottom: boolean
}

const MAX_REMEMBERED_POSITIONS = 100
const positions = new Map<string, TranscriptPosition>()

function validPosition(position: TranscriptPosition): boolean {
  return typeof position === 'object'
    && position !== null
    && typeof position.itemKey === 'string'
    && position.itemKey.length > 0
    && Number.isSafeInteger(position.itemIndex)
    && position.itemIndex >= 0
    && Number.isFinite(position.offset)
    && Number.isFinite(position.scrollTop)
    && position.scrollTop >= 0
    && typeof position.atBottom === 'boolean'
}

/** Keep removed anchors near their next surviving row after a prefix compaction. */
export function rebaseTranscriptPosition(
  position: TranscriptPosition,
  previousItemKeys: readonly string[],
  currentItemKeys: readonly string[]
): TranscriptPosition {
  const currentIndex = currentItemKeys.indexOf(position.itemKey)
  if (currentIndex !== -1) return { ...position, itemIndex: currentIndex }
  if (currentItemKeys.length >= previousItemKeys.length) return position

  const previousIndex = previousItemKeys.indexOf(position.itemKey)
  if (previousIndex === -1) return position
  const currentKeys = new Set(currentItemKeys)
  for (let index = previousIndex + 1; index < previousItemKeys.length; index++) {
    const candidate = previousItemKeys[index]
    if (candidate === undefined || !currentKeys.has(candidate)) continue
    return {
      ...position,
      itemKey: candidate,
      itemIndex: currentItemKeys.indexOf(candidate),
      offset: Math.max(0, position.offset)
    }
  }
  return position
}

/** Resolve a remembered row against the current item order, falling back only if it was removed. */
export function resolveTranscriptAnchorIndex(
  itemKeys: readonly string[],
  position: TranscriptPosition
): number | undefined {
  if (itemKeys.length === 0) return undefined
  const currentIndex = itemKeys.indexOf(position.itemKey)
  if (currentIndex !== -1) return currentIndex
  return Math.min(position.itemIndex, itemKeys.length - 1)
}

/** Save the first visible row for a session, if the transcript belongs to it. */
export function rememberVisibleTranscriptPosition(
  sessionId: string,
  scrollElement: HTMLElement,
  transcriptElement: HTMLElement
): boolean {
  if (transcriptElement.dataset['transcriptSession'] !== sessionId) return false

  const viewport = scrollElement.getBoundingClientRect()
  const viewportTop = viewport.top + scrollElement.clientTop
  const viewportBottom = viewportTop + scrollElement.clientHeight
  const rows = transcriptElement.querySelectorAll<HTMLElement>('[data-transcript-item-key]')
  for (const row of rows) {
    const bounds = row.getBoundingClientRect()
    if (bounds.bottom <= viewportTop || bounds.top >= viewportBottom) continue
    const itemKey = row.dataset['transcriptItemKey']
    const itemIndex = Number(row.dataset['index'])
    if (itemKey === undefined || !Number.isSafeInteger(itemIndex) || itemIndex < 0) continue
    return rememberTranscriptPosition(sessionId, {
      itemKey,
      itemIndex,
      offset: bounds.top - viewportTop,
      scrollTop: Math.max(0, scrollElement.scrollTop),
      atBottom: isAtBottom(scrollElement)
    })
  }
  return false
}

/** Read a recently remembered viewport position for one conversation. */
export function readTranscriptPosition(sessionId: string): TranscriptPosition | undefined {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
  return positions.get(sessionId)
}

/**
 * Remember the visible anchor row, keeping the cache bounded like the chat
 * client's per-thread timeline cache.
 */
export function rememberTranscriptPosition(sessionId: string, position: TranscriptPosition): boolean {
  if (typeof sessionId !== 'string' || sessionId.length === 0 || !validPosition(position)) return false

  positions.delete(sessionId)
  positions.set(sessionId, { ...position })
  while (positions.size > MAX_REMEMBERED_POSITIONS) {
    const oldest = positions.keys().next().value
    if (oldest === undefined) break
    positions.delete(oldest)
  }
  return true
}

export function forgetTranscriptPosition(sessionId: string): void {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return
  positions.delete(sessionId)
}
