import React, { useRef, useEffect } from 'react'

interface ComposerInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /**
   * Consulted before the input's own keys. Returning true means the key was
   * handled and this component leaves it alone.
   *
   * Exists so a menu above the input can own the arrow keys and Enter while it
   * is open, without the input needing to know a menu exists.
   */
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  placeholder?: string
  disabled?: boolean
}

export function ComposerInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
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
    // Mid-composition the keys belong to the input method, not to us.
    if (e.nativeEvent.isComposing) return

    if (onKeyDown?.(e) === true) return

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
