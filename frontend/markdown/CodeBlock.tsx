import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, WrapText } from 'lucide-react'

import { PierreEntryIcon, syntheticFileNameForLanguageId } from '../icons/pierre'
import { useT } from '../i18n'
import type { CodeBlockProps } from './types'
import { useAppTheme } from './theme'
import { useShikiHighlight } from './useShikiHighlight'

/** Copy confirmation is shown briefly, then reverts. */
const COPIED_MS = 1200

/**
 * A fenced code block styled with Shiki syntax highlighting, a header
 * showing the file/language icon and label, a line wrap toggle, and a copy button.
 */
export function CodeBlock({ language, code, fenceTitle }: CodeBlockProps): React.JSX.Element {
  const t = useT()
  const theme = useAppTheme()
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const [wrapped, setWrapped] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { highlightedHtml } = useShikiHighlight(code, language, theme)
  const iconTheme = theme === 'light' ? 'light' : 'dark'
  const iconPath = fenceTitle ? fenceTitle : syntheticFileNameForLanguageId(language)
  const displayTitle = fenceTitle ?? (language === '' ? t('code.text') : language)

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
    <div
      className="markdown-code-block"
      data-language={language}
      data-wrap={wrapped ? 'true' : 'false'}
      dir="ltr"
    >
      <div className="markdown-code-header select-none">
        <span className="markdown-code-title">
          <PierreEntryIcon
            pathValue={iconPath}
            kind="file"
            theme={iconTheme}
            className="markdown-code-icon"
            size={14}
          />
          <span className="markdown-code-language">
            {displayTitle}
          </span>
        </span>
        <div className="markdown-code-actions" role="toolbar" aria-label="Code block actions">
          <button
            type="button"
            className={`markdown-code-action ${wrapped ? 'active' : ''}`}
            onClick={() => setWrapped((v) => !v)}
            aria-label={t('code.wrap')}
            aria-pressed={wrapped}
            title={t('code.wrap')}
          >
            <WrapText size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="markdown-code-action"
            onClick={() => void handleCopy()}
            aria-label={copied ? t('code.copied') : t('code.copy')}
            title={failed ? t('code.unavailable') : copied ? t('code.copied') : t('code.copyTitle')}
          >
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {highlightedHtml !== null ? (
        <div
          className="markdown-code-shiki"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className="markdown-code-body">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}
