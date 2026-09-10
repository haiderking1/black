import React, { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { CodeBlock } from './CodeBlock'
import './markdown.css'

export interface MarkdownProps {
  children: string
  /**
   * Honour single newlines as line breaks.
   *
   * Off for answers, where prose is often hard-wrapped and forcing a break at
   * every newline leaves ragged lines on a wide window. On for reasoning, which
   * tends to put one thought per line, and where collapsing those newlines would
   * run separate thoughts together into one sentence.
   */
  breaks?: boolean
}

/**
 * Renders model markdown.
 *
 * react-markdown builds React elements rather than injecting HTML, so model
 * output cannot introduce markup or script into the renderer. Raw HTML in the
 * source is ignored, which matters because the source is model-generated.
 *
 * Half-finished markdown is expected: while a reply streams, a fenced code block
 * may be open and a list may be mid-item. Both degrade to something readable
 * rather than breaking the render, so no attempt is made to only render complete
 * markdown.
 */
function MarkdownImpl({ children, breaks = false }: MarkdownProps): React.JSX.Element {
  // Memoised because react-markdown re-parses when the plugin array identity
  // changes, and a fresh array on every render would re-parse the whole document.
  const plugins = useMemo(
    () => (breaks ? [remarkGfm, remarkBreaks] : [remarkGfm]),
    [breaks]
  )

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={plugins}
        components={{
          // Links open in the system browser. Without this the renderer would
          // navigate away from the app on a click.
          a: ({ href, children: label }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {label}
            </a>
          ),
          // Fenced code becomes a block with its own header; inline code stays
          // inline. react-markdown routes both through `code`, so the class
          // distinguishes them.
          code: ({ className, children: body }) => {
            const isBlock = typeof className === 'string' && className.startsWith('language-')
            if (!isBlock) return <code className="markdown-inline-code">{body}</code>
            const language = className.slice('language-'.length)
            return <CodeBlock language={language} code={String(body)} />
          },
          pre: ({ children: body }) => <>{body}</>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Memoised on the source text and the breaks flag.
 *
 * A streaming reply re-renders on every token, and re-parsing the whole document
 * each time is the expensive part.
 */
export const Markdown = memo(
  MarkdownImpl,
  (previous, next) => previous.children === next.children && previous.breaks === next.breaks
)
