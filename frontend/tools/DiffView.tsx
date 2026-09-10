import React from 'react'

interface DiffLine {
  marker: string
  number: string
  content: string
  tone: 'added' | 'removed' | 'context' | 'gap'
}

export function readLine(line: string): DiffLine {
  const match = /^([+ -])( *\d+) (.*)$/.exec(line)
  if (match !== null) {
    const marker = match[1]!
    return { marker, number: match[2]!, content: match[3]!, tone: marker === '+' ? 'added' : marker === '-' ? 'removed' : 'context' }
  }
  return { marker: '', number: '', content: line, tone: 'gap' }
}

export function DiffView({ diff }: { diff: string }): React.JSX.Element {
  const lines = diff.split('\n').filter((line) => line.length > 0)

  return (
    <pre className="tool-diff">
      {lines.map((line, index) => {
        const parsed = readLine(line)
        return (
          <div className={'tool-diff-line tool-diff-' + parsed.tone} key={index}>
            <span className="tool-diff-marker">{parsed.marker.trim()}</span>
            <span className="tool-diff-number">{parsed.number}</span>
            <span className="tool-diff-text">{parsed.content}</span>
          </div>
        )
      })}
    </pre>
  )
}
