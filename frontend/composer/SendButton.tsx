import React from 'react'

interface SendButtonProps {
  disabled: boolean
  onClick: () => void
}

export function SendButton({ disabled, onClick }: SendButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={`composer-send-btn ${disabled ? 'disabled' : 'active'}`}
      disabled={disabled}
      onClick={onClick}
      aria-label="Send message"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </svg>
    </button>
  )
}
