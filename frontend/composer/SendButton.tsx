import React from 'react'
import { ArrowUp } from 'lucide-react'

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
      <ArrowUp size={16} strokeWidth={2.5} />
    </button>
  )
}
