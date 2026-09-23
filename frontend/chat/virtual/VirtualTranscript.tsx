import React, { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { readTranscriptPosition, rebaseTranscriptPosition, rememberTranscriptPosition, rememberVisibleTranscriptPosition, resolveTranscriptAnchorIndex, type TranscriptPosition } from './positionCache'
import './virtualTranscript.css'

const OVERSCAN_ROWS = 6
const ESTIMATED_MESSAGE_HEIGHT = 168
const ESTIMATED_FOOTER_HEIGHT = 48
const TRANSCRIPT_PADDING_TOP = 20
const TRANSCRIPT_PADDING_BOTTOM = 32

export interface VirtualTranscriptProps<Item> {
  items: readonly Item[]
  scrollRef: RefObject<HTMLElement | null>
  contentRef: (node: HTMLDivElement | null) => void
  positionKey?: string
  itemKey: (item: Item) => string
  renderItem: (item: Item, index: number) => ReactNode
  footer?: ReactNode
}

export function VirtualTranscript<Item>({
  items,
  scrollRef,
  contentRef,
  positionKey,
  itemKey,
  renderItem,
  footer,
}: VirtualTranscriptProps<Item>): React.JSX.Element {
  const hasFooter = footer !== undefined && footer !== null
  const itemsRef = useRef(items)
  const itemKeysRef = useRef<string[]>([])
  const itemKeyVersionRef = useRef(0)
  const previousPositionKeyRef = useRef(positionKey)
  const pendingRestorePositionRef = useRef<TranscriptPosition | undefined>(undefined)
  const hasFooterRef = useRef(hasFooter)
  itemsRef.current = items
  hasFooterRef.current = hasFooter

  const nextItemKeys = items.map(itemKey)
  const previousItemKeys = itemKeysRef.current
  const itemKeysChanged = nextItemKeys.length !== previousItemKeys.length
    || nextItemKeys.some((key, index) => key !== previousItemKeys[index])
  const sessionChanged = previousPositionKeyRef.current !== positionKey
  if (sessionChanged) {
    pendingRestorePositionRef.current = undefined
    previousPositionKeyRef.current = positionKey
  } else if (itemKeysChanged && previousItemKeys.length > 0 && positionKey !== undefined) {
    const saved = readTranscriptPosition(positionKey)
    pendingRestorePositionRef.current = saved === undefined
      ? undefined
      : rebaseTranscriptPosition(saved, previousItemKeys, nextItemKeys)
  }
  if (itemKeysChanged) {
    itemKeysRef.current = nextItemKeys
    itemKeyVersionRef.current += 1
  }
  const itemKeyVersion = itemKeyVersionRef.current

  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef])
  const estimateSize = useCallback((index: number) => {
    const currentItems = itemsRef.current
    if (index >= currentItems.length) return ESTIMATED_FOOTER_HEIGHT
    const lastMessageWithoutFooter = !hasFooterRef.current && index === currentItems.length - 1
    return ESTIMATED_MESSAGE_HEIGHT - (lastMessageWithoutFooter ? 24 : 0)
  }, [])
  const getItemKey = useCallback((index: number) => {
    const currentItems = itemsRef.current
    if (index >= currentItems.length && hasFooterRef.current) return '__transcript-footer__'
    return itemKeysRef.current[index] ?? '__transcript-invalid-row-' + index
  }, [itemKeyVersion])
  const count = items.length + (hasFooter ? 1 : 0)
  const virtualizer = useVirtualizer({
    count,
    getScrollElement,
    estimateSize,
    getItemKey,
    overscan: OVERSCAN_ROWS,
    paddingStart: TRANSCRIPT_PADDING_TOP,
    paddingEnd: TRANSCRIPT_PADDING_BOTTOM,
  })

  const restoredPositionRef = useRef<{ sessionKey: string; itemKeyVersion: number } | undefined>(undefined)
  useEffect(() => {
    const element = scrollRef.current
    if (positionKey === undefined || element === null) return
    if (restoredPositionRef.current?.sessionKey === positionKey
      && restoredPositionRef.current.itemKeyVersion === itemKeyVersion) return
    const saved = pendingRestorePositionRef.current ?? readTranscriptPosition(positionKey)
    const finishRestore = (rememberVisibleRow = true): void => {
      restoredPositionRef.current = { sessionKey: positionKey, itemKeyVersion }
      pendingRestorePositionRef.current = undefined
      if (!rememberVisibleRow) return
      const transcript = element.querySelector<HTMLElement>('.chat-transcript-virtual')
      if (transcript !== null) rememberVisibleTranscriptPosition(positionKey, element, transcript)
    }
    if (saved?.atBottom !== false) {
      if (count === 0) element.scrollTop = element.scrollHeight
      else virtualizer.scrollToEnd({ behavior: 'auto' })
      finishRestore()
      return
    }

    const anchorIndex = resolveTranscriptAnchorIndex(itemKeysRef.current, saved)
    if (anchorIndex === undefined) {
      virtualizer.scrollToOffset(saved.scrollTop, { behavior: 'auto' })
      finishRestore()
      return
    }

    virtualizer.scrollToIndex(anchorIndex, { align: 'start', behavior: 'auto' })
    let attempts = 0
    let stableFrames = 0
    let frame = 0
    let cancelled = false
    const restoreAnchor = (): void => {
      if (cancelled) return
      const transcript = element.querySelector<HTMLElement>('.chat-transcript-virtual')
      const rows = transcript?.querySelectorAll<HTMLElement>('[data-transcript-item-key]') ?? []
      let row = Array.from(rows).find((candidate) => candidate.dataset['transcriptItemKey'] === saved.itemKey)
      if (row === undefined && attempts >= 2) {
        row = Array.from(rows).find((candidate) => Number(candidate.dataset['index']) === anchorIndex)
      }

      if (row !== undefined) {
        const viewport = element.getBoundingClientRect()
        const viewportTop = viewport.top + element.clientTop
        const correction = row.getBoundingClientRect().top - viewportTop - saved.offset
        if (Number.isFinite(correction) && Math.abs(correction) > 0.5) {
          stableFrames = 0
          virtualizer.scrollToOffset(element.scrollTop + correction, { align: 'start', behavior: 'auto' })
        } else {
          stableFrames += 1
        }
        attempts += 1
        if (attempts < 8 && stableFrames < 2) {
          frame = requestAnimationFrame(restoreAnchor)
          return
        }
        finishRestore()
        return
      }

      if (attempts < 6) {
        attempts += 1
        frame = requestAnimationFrame(restoreAnchor)
        return
      }
      virtualizer.scrollToOffset(saved.scrollTop, { align: 'start', behavior: 'auto' })
      const fallbackItemKey = itemKeysRef.current[anchorIndex]
      if (fallbackItemKey !== undefined) {
        rememberTranscriptPosition(positionKey, {
          itemKey: fallbackItemKey,
          itemIndex: anchorIndex,
          offset: 0,
          scrollTop: Math.max(0, element.scrollTop),
          atBottom: false
        })
      }
      finishRestore(false)
    }

    frame = requestAnimationFrame(restoreAnchor)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [positionKey, itemKeyVersion, scrollRef, count, virtualizer])

  return (
    <div
      ref={contentRef}
      className="chat-column chat-transcript chat-transcript-virtual"
      data-transcript-session={positionKey}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const isFooter = virtualItem.index >= items.length
        const item = items[virtualItem.index]
        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-transcript-item-key={isFooter || item === undefined ? undefined : virtualItem.key}
            className="chat-transcript-virtual-row"
            style={{
              transform: `translateY(${virtualItem.start}px)`,
              paddingBottom: virtualItem.index === count - 1 ? 0 : 24,
            }}
          >
            {isFooter ? footer : item === undefined ? null : renderItem(item, virtualItem.index)}
          </div>
        )
      })}
    </div>
  )
}
