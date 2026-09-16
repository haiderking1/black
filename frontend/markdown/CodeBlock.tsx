import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { useT } from '../i18n'

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
  const t = useT()
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
    <div className="markdown-code-block" dir="ltr">
      <div className="markdown-code-header">
        <span className="markdown-code-language">{language === '' ? t('code.text') : language}</span>
        <button
          type="button"
          className="markdown-code-copy"
          onClick={() => void handleCopy()}
          aria-label={copied ? t('code.copied') : t('code.copy')}
          title={failed ? t('code.unavailable') : copied ? t('code.copied') : t('code.copyTitle')}
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
