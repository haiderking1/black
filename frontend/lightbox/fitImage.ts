/**
 * How large to draw an image so it fits the window without overflowing it.
 *
 * This exists because of the close button. Left to the browser, an image sized
 * by max-width and object-fit ends up inside a box whose shape depends on the
 * image, and a button pinned to that box drifts away from the corner of the
 * picture as the picture changes shape. Working the size out here and putting
 * exact width and height on the image means the box is the image, so the button
 * is against the same corner every time.
 *
 * A small image is never enlarged. The point of opening a preview is to see the
 * picture at its own size, not to see it blown up into a blur.
 */

export interface Viewport {
  width: number
  height: number
}

export interface NaturalSize {
  width: number
  height: number
}

export interface FittedSize {
  width: number
  height: number
  /** The ceiling to keep on the image, applied before it has been measured. */
  maxHeight: number
}

/** Width the image may take, as a share of the window. */
const WIDTH_SHARE = 0.92
/** Height it may take, as a share of the window. */
const HEIGHT_SHARE = 0.86
/** Room kept back for the caption below it and the space around the whole thing. */
const HEIGHT_RESERVE = 80

export function maxImageHeight(viewport: Viewport): number {
  return Math.max(1, Math.min(viewport.height * HEIGHT_SHARE, viewport.height - HEIGHT_RESERVE))
}

export function fitImage(natural: NaturalSize, viewport: Viewport): FittedSize {
  const maxHeight = maxImageHeight(viewport)

  // Nothing is known until the image reports its own size, so the caller falls
  // back to css ceilings for the first frame instead of a box of zeroes.
  if (natural.width <= 0 || natural.height <= 0) {
    return { width: 0, height: 0, maxHeight }
  }

  const fit = Math.min(
    1,
    (viewport.width * WIDTH_SHARE) / natural.width,
    maxHeight / natural.height
  )

  return {
    width: Math.round(natural.width * fit),
    height: Math.round(natural.height * fit),
    maxHeight
  }
}
