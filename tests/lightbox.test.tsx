import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Lightbox } from '../frontend/lightbox/Lightbox'
import { PreviewImage } from '../frontend/lightbox/PreviewImage'
import { PreviewProvider, usePreview } from '../frontend/lightbox/PreviewContext'

/**
 * Structure rather than behaviour.
 *
 * These render the overlay to markup, which is enough to prove the pieces are
 * wired the way the interface needs them: a labelled dialog, a close control
 * that can be reached, the image itself, and a caption only when there is a
 * name to show. Escape and dismissal need a real document and are checked by
 * hand.
 */
const render = (element: React.ReactElement): string => renderToStaticMarkup(element)

describe('Lightbox', () => {
  const base = { src: 'data:image/png;base64,AAAA', onClose: () => {} }

  it('announces itself as a dialog named after the image', () => {
    const html = render(<Lightbox request={{ ...base, name: 'shot.png' }} onClose={base.onClose} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="shot.png"')
  })

  it('falls back to a generic label when the image has no name', () => {
    const html = render(<Lightbox request={{ src: base.src }} onClose={base.onClose} />)
    expect(html).toContain('aria-label="Image preview"')
  })

  it('shows the image at full size', () => {
    const html = render(<Lightbox request={{ ...base, name: 'shot.png' }} onClose={base.onClose} />)
    expect(html).toContain('lightbox-image')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('provides a close control rather than relying on the scrim', () => {
    const html = render(<Lightbox request={{ ...base, name: 'shot.png' }} onClose={base.onClose} />)
    expect(html).toContain('lightbox-close')
    expect(html).toContain('aria-label="Close preview"')
  })

  it('captions the image with its name', () => {
    const html = render(<Lightbox request={{ ...base, name: 'shot.png' }} onClose={base.onClose} />)
    expect(html).toContain('lightbox-name')
    expect(html).toContain('shot.png')
  })

  it('leaves the caption out when there is nothing to write in it', () => {
    // An empty caption element would still take up a line under the image.
    const html = render(<Lightbox request={{ src: base.src }} onClose={base.onClose} />)
    expect(html).not.toContain('lightbox-name')
  })

  it('uses the name as the alt text so the picture is describable', () => {
    const html = render(<Lightbox request={{ ...base, name: 'shot.png' }} onClose={base.onClose} />)
    expect(html).toContain('alt="shot.png"')
  })
})

/** Reads the context and renders a button that does nothing, so the hook runs. */
function Probe(): React.JSX.Element {
  const { open } = usePreview()
  return <button type="button" onClick={() => open({ src: 'x' })}>probe</button>
}

describe('PreviewProvider', () => {
  it('renders its children and no overlay to begin with', () => {
    const html = render(
      <PreviewProvider>
        <p>content</p>
      </PreviewProvider>
    )
    expect(html).toContain('content')
    // The overlay only exists once something has been opened.
    expect(html).not.toContain('lightbox')
  })

  it('supplies the hook to anything inside it', () => {
    expect(() =>
      render(
        <PreviewProvider>
          <Probe />
        </PreviewProvider>
      )
    ).not.toThrow()
  })

  it('refuses to guess when there is no provider above it', () => {
    // A missing provider must be loud. Returning a no-op would make every image
    // in the app silently unclickable, which looks like a design choice.
    expect(() => render(<Probe />)).toThrow(/outside PreviewProvider/)
  })
})

describe('PreviewImage', () => {
  const withProvider = (element: React.ReactElement): string =>
    render(<PreviewProvider>{element}</PreviewProvider>)

  it('wraps the image in something that can be clicked and focused', () => {
    const html = withProvider(<PreviewImage src="data:image/png;base64,AAAA" name="shot.png" />)
    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('preview-trigger')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('says what opening it will do', () => {
    const html = withProvider(<PreviewImage src="x" name="shot.png" />)
    expect(html).toContain('aria-label="Open shot.png larger"')
  })

  it('still labels an unnamed image', () => {
    const html = withProvider(<PreviewImage src="x" />)
    expect(html).toContain('aria-label="Open image larger"')
  })

  it('keeps the class it was given, so each site keeps its size', () => {
    const html = withProvider(<PreviewImage src="x" className="message-image" />)
    expect(html).toContain('class="message-image"')
  })

  it('uses the name as alt text when none is given', () => {
    const html = withProvider(<PreviewImage src="x" name="shot.png" />)
    expect(html).toContain('alt="shot.png"')
  })
})
