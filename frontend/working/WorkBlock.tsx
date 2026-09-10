import React, { useId } from 'react'
import { ThinkingBlock } from '../thinking'
import { ToolRunList } from '../tools'
import type { WorkPart } from './model'

function Activity({ parts, active }: { parts: WorkPart[]; active: boolean }): React.JSX.Element {
  return <>{parts.map((part, index) => {
    const key = part.round + ':' + index
    if (part.type === 'text') return null
    if (part.type === 'thinking') return <ThinkingBlock key={key} thinking={part.text}
      isStreaming={active && part.durationMs === undefined} durationMs={part.durationMs} />
    return <ToolRunList key={key} runs={part.runs} />
  })}</>
}


export function WorkBlock({ activity, expanded, running, label, note, onExpandedChange }: {
 activity: WorkPart[]; expanded: boolean; running: boolean; label: string; note?: string;
 onExpandedChange: (expanded: boolean) => void
}): React.JSX.Element {
 const bodyId = useId()
  return <section className="working-section" data-working="">
      <button type="button" className="working-header" aria-expanded={expanded} aria-controls={bodyId}
        onClick={() => onExpandedChange(!expanded)}>
        <span className={running ? 'shimmer-text' : undefined}>{label}</span>
        <svg className={expanded ? 'working-caret working-caret-open' : 'working-caret'} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M4.5 2.5 L8 6 L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {note ? <span className="working-status">{note}</span> : null}
      </button>
      <div id={bodyId} className="working-body" hidden={!expanded}>
        <Activity parts={expanded ? activity : []} active={running} />
      </div>
    </section>

}
