import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * An anchored menu.
 *
 * Owns the parts every picker needs and nothing else: open state, dismissal on
 * an outside click or Escape, and focus returning to the trigger. The trigger
 * and the menu contents are supplied by the caller, so a picker is just a list.
 */
export interface DropdownProps {
  /** Rendered inside the trigger button. */
  label: ReactNode
  /** Accessible name for the trigger. */
  title: string
  /** Class for the trigger, so each picker can size itself. */
  className?: string
  disabled?: boolean
  /** Rendered inside the menu. Receives a close callback. */
  children: (close: () => void) => ReactNode
}

export function Dropdown({
  label,
  title,
  className,
  disabled = false,
  children,
}: DropdownProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const close = useCallback((): void => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent): void => {
      const container = containerRef.current
      if (container !== null && !container.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, close])

  return (
    <div className="composer-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={className ?? 'composer-picker-trigger'}
        title={title}
        aria-label={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
      </button>

      {open ? (
        <div className="composer-picker-menu" role="listbox" aria-label={title}>
          {children(close)}
        </div>
      ) : null}
    </div>
  )
}
