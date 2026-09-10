import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { fitImage, maxImageHeight } from '../frontend/lightbox/fitImage'
import { Lightbox } from '../frontend/lightbox/Lightbox'

const viewport = { width: 1200, height: 800 }

describe('maxImageHeight', () => {
  it('keeps room below the image for the caption', () => {
    // 86% of 800 is 688, but 800 minus the reserve is 720, so the share wins.
    expect(maxImageHeight(viewport)).toBeCloseTo(688, 0)
  })

  it('never reserves more than the window has', () => {
    // A window shorter than the reserve must not produce a negative ceiling.
    expect(maxImageHeight({ width: 100, height: 60 })).toBeGreaterThanOrEqual(1)
  })
})

describe('fitImage', () => {
  it('does not enlarge an image smaller than the window', () => {
    // Opening a preview is to see the picture at its own size.
    const fitted = fitImage({ width: 200, height: 100 }, viewport)
    expect(fitted.width).toBe(200)
    expect(fitted.height).toBe(100)
  })

  it('fits a wide image by its width', () => {
    const fitted = fitImage({ width: 4000, height: 1000 }, viewport)
    expect(fitted.width).toBe(Math.round(1200 * 0.92))
    // Aspect ratio is preserved, which is what keeps the box the same shape as
    // the picture.
    expect(fitted.width / fitted.height).toBeCloseTo(4, 1)
  })

  it('fits a tall image by its height', () => {
    const fitted = fitImage({ width: 1000, height: 4000 }, viewport)
    expect(fitted.height).toBeLessThanOrEqual(maxImageHeight(viewport))
    expect(fitted.width / fitted.height).toBeCloseTo(0.25, 1)
  })

  it('leaves the height ceiling available before the image is measured', () => {
    const fitted = fitImage({ width: 0, height: 0 }, viewport)
    expect(fitted).toEqual({ width: 0, height: 0, maxHeight: Math.round(maxImageHeight(viewport)) })
  })

  it('reports a usable size for every shape in a range of windows', () => {
    // The corner is only stable if a definite size always comes out.
    const shapes = [
      { width: 1, height: 1 },
      { width: 4000, height: 10 },
      { width: 10, height: 4000 },
      { width: 1920, height: 1080 },
      { width: 800, height: 800 }
    ]
    const windows = [
      { width: 320, height: 480 },
      { width: 1200, height: 800 },
      { width: 3440, height: 1440 }
    ]
    for (const natural of shapes) {
      for (const window of windows) {
        const fitted = fitImage(natural, window)
        expect(Number.isFinite(fitted.width)).toBe(true)
        expect(Number.isFinite(fitted.height)).toBe(true)
        expect(fitted.width).toBeGreaterThan(0)
        expect(fitted.height).toBeGreaterThan(0)
        expect(fitted.width).toBeLessThanOrEqual(window.width)
        expect(fitted.height).toBeLessThanOrEqual(window.height)
      }
    }
  })

  it('never returns a fractional size', () => {
    // A fractional width would leave the box and the image disagreeing by a
    // subpixel, which is exactly the kind of drift this is here to remove.
    const fitted = fitImage({ width: 1337, height: 733 }, viewport)
    expect(Number.isInteger(fitted.width)).toBe(true)
    expect(Number.isInteger(fitted.height)).toBe(true)
  })
})

describe('Lightbox structure', () => {
  const render = (element: React.ReactElement): string => renderToStaticMarkup(element)

  it('keeps the button, the image and the caption in one box', () => {
    // The button is positioned against this box. If the caption sits outside it,
    // the box stops being the image and the corner stops being the corner.
    const html = render(
      <Lightbox request={{ src: 'data:image/png;base64,AAAA', name: 'shot.png' }} onClose={() => {}} />
    )
    const figure = html.slice(html.indexOf('lightbox-figure'), html.indexOf('lightbox-name'))
    expect(figure).toContain('lightbox-close')
    expect(figure).toContain('lightbox-image')
  })

  it('puts a ceiling on the image before it has been measured', () => {
    // Nothing is known on the first frame, so the image is held by css rather
    // than given a size of zero.
    const html = render(<Lightbox request={{ src: 'x' }} onClose={() => {}} />)
    expect(html).toContain('max-width:92vw')
    expect(html).toContain('max-height')
  })
})
