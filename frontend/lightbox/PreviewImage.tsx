import React from 'react'

import { usePreview } from './PreviewContext'

/**
 * An image that can be opened full size.
 *
 * A button rather than an image with a click handler, so it can be reached by
 * keyboard and announced as something that does something. Every place an image
 * appears goes through here, so a new one cannot be added without the preview
 * coming with it.
 */
export function PreviewImage({
  src,
  name,
  className,
  alt,
  title
}: {
  src: string
  name?: string
  /** Applied to the image, so each site keeps the size it already had. */
  className?: string
  alt?: string
  title?: string
}): React.JSX.Element {
  const { open } = usePreview()

  const label = name ?? 'image'

  return (
    <button
      type="button"
      className="preview-trigger"
      onClick={() => open(name === undefined ? { src } : { src, name })}
      aria-label={'Open ' + label + ' larger'}
      title={title ?? 'Open larger'}
    >
      <img className={className} src={src} alt={alt ?? label} />
    </button>
  )
}
