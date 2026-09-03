import React from 'react'

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
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  )
}
