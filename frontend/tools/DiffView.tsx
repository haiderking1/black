import React from 'react'

/**
 * The change an edit made, line by line.
 *
 * Colouring comes from the leading marker the server already put there, so the
 * two cannot disagree about which lines were added. The first character is the
 * whole signal; everything after it is the line as it appears in the file.
 */
export function DiffView({ diff }: { diff: string }): React.JSX.Element {
  const lines = diff.split('\n')

  return (
    <pre className="tool-diff">
      {lines.map((line, index) => {
        const marker = line.slice(0, 1)
        const tone = marker === '+' ? 'added' : marker === '-' ? 'removed' : 'context'
        return (
          <div className={'tool-diff-line tool-diff-' + tone} key={index}>
            {line}
          </div>
        )
      })}
    </pre>
  )
}
