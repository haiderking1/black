import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { fitImage, type NaturalSize, type Viewport } from './fitImage'
import type { PreviewRequest } from './PreviewContext'
import './lightbox.css'

/**
 * The window's size, or a stand-in when there is no window.
 *
 * The overlay only ever runs in a browser. The guard is here so the component
 * can still be rendered somewhere without one, which is how its structure is
 * tested: whether the button, the image and the caption really do share a box
 * is not something that can be checked by reading the source.
 */
function currentViewport(): Viewport {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800 }
  }
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * One image, at full size, over everything else.
 *
 * Dismissed three ways, because each is what somebody will reach for: the close
 * button, Escape, and the space around the image. A preview with only one way
 * out is a preview people get stuck in.
 *
 * The image itself does not dismiss. Clicking a picture to look at it closely
 * and having it vanish is the opposite of what was asked for.
 */
export function Lightbox({
  request,
  onClose
}: {
  request: PreviewRequest
  onClose: () => void
}): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)

  // The image's own size, reported when it loads, and the window's, tracked so
  // a resize refits. Both are needed to work out a definite size to draw at.
  const [natural, setNatural] = useState<NaturalSize>({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<Viewport>(currentViewport)

  useEffect(() => {
    const onResize = (): void => setViewport(currentViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fitted = fitImage(natural, viewport)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Claimed so a modal underneath does not also close on the same key.
      event.stopPropagation()
      onClose()
    }

    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  useEffect(() => {
    // Focus goes to the close button so Escape and Tab behave, and comes back
    // to whatever opened this rather than to the top of the page.
    const previous = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus()
      }
    }
  }, [])

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={request.name ?? 'Image preview'}
      /* On the way down rather than on the click, so starting a drag on the
         image and releasing it over the background does not dismiss. */
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      {/* The button, the image and the caption share one positioned box, and the
          image inside it is given an exact size. That is what keeps the button on
          the corner of the picture: the box is the image, not a container the
          image happens to sit somewhere inside. */}
      <div className="lightbox-figure" style={natural.width > 0 ? { width: fitted.width } : undefined}>
        {/* No title. The native tooltip appears over the image the moment the
            cursor settles, naming an action that is already an X in a corner.
            aria-label still names it for anything that cannot see the glyph. */}
        <button
          ref={closeRef}
          type="button"
          className="lightbox-close"
          onClick={onClose}
          aria-label="Close preview"
        >
          <X size={15} />
        </button>
        <img
          className="lightbox-image"
          src={request.src}
          alt={request.name ?? 'Image preview'}
          /* Exact size once measured, css ceilings until then so the first
             frame is not a box with nothing in it. */
          style={
            natural.width > 0
              ? { width: fitted.width, height: fitted.height }
              : { maxWidth: '92vw', maxHeight: fitted.maxHeight }
          }
          onLoad={(event) => {
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight
            })
          }}
        />
        {request.name === undefined ? null : <p className="lightbox-name">{request.name}</p>}
      </div>
    </div>
  )
}
