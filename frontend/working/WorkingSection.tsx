import React from 'react'
import type { Message } from '../chat/types'
import { CompactionNotice } from '../compaction'
import { Markdown } from '../markdown'
import { useWorkLabel } from './useWorkLabel'
import { WorkBlock } from './WorkBlock'
import { transcriptBlocks } from './transcriptBlocks'
import { workIsExpanded, type TurnWork, type WorkPart } from './model'
import './working.css'

function legacyActivity(message: Message): WorkPart[] {
  const parts: WorkPart[] = []
  if (message.thinking) parts.push({ type: 'thinking', round: 0, text: message.thinking,
    startedAt: 0, durationMs: message.thinkingMs })
  if (message.tools?.length) parts.push({ type: 'tools', round: 0, runs: message.tools })
  return parts
}

function statusNote(work: TurnWork | undefined): string | undefined {
  if (work?.status === 'stopped') return 'Stopped'
  if (work?.status === 'interrupted') return 'Interrupted'
  if (work?.status === 'incomplete') return 'Response limit reached'
  if (work?.status === 'failed') return 'Failed'
  return undefined
}

export function WorkingSection({ message, active, onExpandedChange }: {
  message: Message
  active: boolean
  onExpandedChange: (expanded: boolean, blockKey?: string) => void
}): React.JSX.Element {
  const work = message.work
  const parts = work?.parts ?? [...legacyActivity(message), { type: 'text' as const, round: 0, text: message.content }]
  const blocks = transcriptBlocks(parts)
  const expanded = workIsExpanded(work ?? { expanded: message.workExpanded })
  const running = active && work?.status === 'active'
  const note = statusNote(work)
  const label = useWorkLabel(work, running)
  const hasWork = blocks.some(block => block.type === 'work')
  return <div className="assistant-turn">
    {message.compacted === undefined ? null : <CompactionNotice tokensBefore={message.compacted.before}
      tokensAfter={message.compacted.after} isStreaming={running && blocks.length === 0} />}
    {blocks.map(block => block.type === 'text'
      ? <div className="working-answer" key={block.key}><Markdown>{block.text}</Markdown></div>
      : <WorkBlock key={block.key} activity={block.parts}
          expanded={work?.expandedBlocks?.[block.key] ?? expanded}
          running={running}
          label={label} note={note}
          onExpandedChange={value => onExpandedChange(value, block.key)} />)}
    {work?.error ? <div className="working-error" role="status">{work.error}</div>
      : !hasWork && note ? <div className="working-status" role="status">{note}</div> : null}
    {work?.status === 'completed' && blocks.length === 0 ? <div className="working-status">Empty reply</div> : null}
  </div>
}
