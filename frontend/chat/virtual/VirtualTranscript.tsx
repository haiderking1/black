import React, { useCallback, useRef, type ReactNode, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

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
  itemKey: (item: Item) => string
  renderItem: (item: Item, index: number) => ReactNode
  footer?: ReactNode
}

export function VirtualTranscript<Item>({
  items,
  scrollRef,
  contentRef,
  itemKey,
  renderItem,
  footer,
}: VirtualTranscriptProps<Item>): React.JSX.Element {
  const hasFooter = footer !== undefined && footer !== null
  const itemsRef = useRef(items)
  const itemKeyRef = useRef(itemKey)
  const hasFooterRef = useRef(hasFooter)
  itemsRef.current = items
  itemKeyRef.current = itemKey
  hasFooterRef.current = hasFooter

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
    const item = currentItems[index]
    return item === undefined ? '__transcript-invalid-row-' + index : itemKeyRef.current(item)
  }, [])
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

  return (
    <div
      ref={contentRef}
      className="chat-column chat-transcript chat-transcript-virtual"
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
