import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export interface CodeBlockProps {
  language: string
  code: string
}

/** Copy confirmation is shown briefly, then reverts. */
const COPIED_MS = 1200

/**
 * A fenced code block.
 *
 * Carries its language and a copy control, since reading code is the main thing
 * this panel is for.
 */
export function CodeBlock({ language, code }: CodeBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    []
  )

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setFailed(false)
    } catch {
      // Clipboard access can be refused; say so rather than showing a false tick.
      setFailed(true)
      setCopied(false)
    }

    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setCopied(false)
      setFailed(false)
    }, COPIED_MS)
  }, [code])

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span className="markdown-code-language">{language === '' ? 'text' : language}</span>
        <button
          type="button"
          className="markdown-code-copy"
          onClick={() => void handleCopy()}
          aria-label={copied ? 'Copied' : 'Copy code'}
          title={failed ? 'Clipboard unavailable' : copied ? 'Copied' : 'Copy'}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        </button>
      </div>
      <pre className="markdown-code-body">
        <code>{code}</code>
      </pre>
    </div>
  )
}
