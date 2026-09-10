import React, { useRef } from 'react'
import { Paperclip } from 'lucide-react'

/**
 * Opens the file picker for images.
 *
 * The input is hidden and driven by the button rather than styled, because a
 * native file input cannot be made to look like anything else and the button
 * beside it is what the reader actually aims at.
 *
 * The value is cleared after every pick. Without that, choosing the same file
 * twice in a row fires no change event, and the second attempt looks broken.
 */
export function AttachButton({
  onFiles,
  disabled = false
}: {
  onFiles: (files: File[]) => void
  disabled?: boolean
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        type="button"
        className="composer-icon-btn"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach images"
        title="Attach images"
      >
        <Paperclip size={17} />
      </button>
      <input
        ref={inputRef}
        className="attachment-input"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length > 0) {
            onFiles(files)
          }
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  )
}
