import React, { useRef, useEffect } from 'react'

interface ComposerInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
}

export function ComposerInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Message Black...',
  disabled = false
}: ComposerInputProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return

    // Auto-grow height based on scrollHeight
    el.style.height = 'auto'
    const nextHeight = Math.min(el.scrollHeight, 220)
    el.style.height = `${nextHeight}px`
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSubmit()
      }
    }
  }

  return (
    <div className="composer-input-row">
      <textarea
        ref={textareaRef}
        className="composer-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
      />
    </div>
  )
}
