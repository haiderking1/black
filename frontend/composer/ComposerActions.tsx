import React from 'react'
import { Plus } from 'lucide-react'

interface ComposerActionsProps {
  onAttachClick?: () => void
}

export function ComposerActions({
  onAttachClick
}: ComposerActionsProps): React.JSX.Element {
  return (
    <div className="composer-actions-left">
      {/* Plus / Attach button */}
      <button
        type="button"
        className="composer-icon-btn"
        onClick={onAttachClick}
        aria-label="Attach file or context"
        title="Attach"
      >
        <Plus size={18} />
      </button>
    </div>
  )
}
