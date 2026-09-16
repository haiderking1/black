import React, { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { directionFor, langFor, useLanguage } from '../language'
import { AlertCallout, isAlertKind } from './AlertCallout'
import { CodeBlock } from './CodeBlock'
import { remarkGithubAlerts } from './alerts'
import { remarkNormalizeListItemIndentation } from './indentation'
import { extractFenceTitle, remarkPreserveCodeMeta } from './meta'
import type { AlertKind, MarkdownProps } from './types'
import './markdown.css'

/**
 * Renders model markdown with GitHub-flavored markdown extensions,
 * GitHub callout alerts, indentation recovery, Pierre file icons, and Shiki code blocks.
 */
function MarkdownImpl({ children, breaks = false }: MarkdownProps): React.JSX.Element {
  const language = useLanguage()
  const dir = directionFor(language, children)
  const lang = langFor(language, children)

  // Memoised because react-markdown re-parses when the plugin array identity
  // changes, and a fresh array on every render would re-parse the whole document.
  const plugins = useMemo(() => {
    const base = [
      remarkGfm,
      remarkNormalizeListItemIndentation,
      remarkGithubAlerts,
      remarkPreserveCodeMeta,
    ]
    return breaks ? [...base, remarkBreaks] : base
  }, [breaks])

  return (
    <div className="markdown" dir={dir} lang={lang}>
      <ReactMarkdown
        remarkPlugins={plugins}
        components={{
          a: ({ href, children: label }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {label}
            </a>
          ),
          code: ({ className, children: body, node, ...props }) => {
            const isBlock = typeof className === 'string' && className.startsWith('language-')
            if (!isBlock) {
              return (
                <code className="markdown-inline-code" dir="ltr">
                  {body}
                </code>
              )
            }
            const languageName = className.slice('language-'.length)
            const meta = (props as Record<string, unknown>)['data-code-meta'] ??
              (node as { data?: { meta?: unknown } })?.data?.meta
            const fenceTitle = extractFenceTitle(typeof meta === 'string' ? meta : undefined)
            return (
              <CodeBlock
                language={languageName}
                code={String(body).replace(/\n$/, '')}
                fenceTitle={fenceTitle}
              />
            )
          },
          pre: ({ children: body }) => <>{body}</>,
          blockquote: ({ node: _node, children: quoteChildren, ...props }) => {
            const alertAttr = (props as Record<string, unknown>)['data-alert']
            const alertKind = typeof alertAttr === 'string' ? alertAttr : undefined
            if (isAlertKind(alertKind)) {
              return <AlertCallout kind={alertKind.toLowerCase() as AlertKind}>{quoteChildren}</AlertCallout>
            }
            return <blockquote {...props}>{quoteChildren}</blockquote>
          },
          table: ({ node: _node, children: tableChildren, ...props }) => (
            <div className="markdown-table-wrapper">
              <table {...props}>{tableChildren}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export const Markdown = memo(
  MarkdownImpl,
  (previous, next) => previous.children === next.children && previous.breaks === next.breaks
)
