import React from 'react'
import { X } from 'lucide-react'

import { PreviewImage } from '../lightbox'
import { attachmentDataUrl, formatAttachmentSize, type Attachment } from './attachments'

/**
 * The images waiting to be sent, above the text.
 *
 * Above rather than below, because the text is what gets typed next and a row
 * of thumbnails under the cursor would push it around as attachments come and
 * go.
 *
 * Each one can be removed. An attachment with no way to take it back is a
 * mistake the reader has to either send or discard the whole message over.
 */
export function AttachmentStrip({
  attachments,
  onRemove,
  disabled = false
}: {
  attachments: readonly Attachment[]
  onRemove: (id: string) => void
  disabled?: boolean
}): React.JSX.Element | null {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="attachment-strip">
      {attachments.map((attachment) => (
        <div className="attachment-chip" key={attachment.id}>
          <PreviewImage
            className="attachment-thumb"
            src={attachmentDataUrl(attachment)}
            name={attachment.name}
            alt={attachment.name}
            title={attachment.name + ', ' + formatAttachmentSize(attachment.size)}
          />
          <button
            type="button"
            className="attachment-remove"
            onClick={() => onRemove(attachment.id)}
            disabled={disabled}
            aria-label={'Remove ' + attachment.name}
            title="Remove"
          >
            <X size={11} strokeWidth={3} />
          </button>
        </div>
      ))}
    </div>
  )
}
