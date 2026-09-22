import React from 'react'
import type { Message } from '../chat/types'
import { CompactionNotice, CompactionProgress } from '../compaction'
import { Markdown } from '../markdown'
import { useT } from '../i18n'
import { useWorkLabel } from './useWorkLabel'
import { WorkBlock } from './WorkBlock'
import { transcriptBlocks } from './transcriptBlocks'
import { RetryNotice } from './retry/Notice'
import { workIsExpanded, type TurnWork, type WorkPart } from './model'
import './working.css'

function legacyActivity(message: Message): WorkPart[] {
  const parts: WorkPart[] = []
  if (message.thinking) parts.push({ type: 'thinking', round: 0, text: message.thinking,
    startedAt: 0, durationMs: message.thinkingMs })
  if (message.tools?.length) parts.push({ type: 'tools', round: 0, runs: message.tools })
  return parts
}

function statusNote(work: TurnWork | undefined, stopped: string, interrupted: string, limit: string, failed: string): string | undefined {
  if (work?.status === 'stopped') return stopped
  if (work?.status === 'interrupted') return interrupted
  if (work?.status === 'incomplete') return limit
  if (work?.status === 'failed') return failed
  return undefined
}

export function WorkingSection({ message, active, onRetry, onExpandedChange }: {
  message: Message
  active: boolean
  onRetry?: () => void
  onExpandedChange: (expanded: boolean, blockKey?: string) => void
}): React.JSX.Element {
  const t = useT()
  const work = message.work
  const parts = work?.parts ?? [...legacyActivity(message), { type: 'text' as const, round: 0, text: message.content }]
  const blocks = transcriptBlocks(parts)
  const expanded = workIsExpanded(work ?? { expanded: message.workExpanded })
  const running = active && work?.status === 'active'
  const note = statusNote(work, t('work.stopped'), t('work.interrupted'), t('work.limit'), t('work.failed'))
  const label = useWorkLabel(work, running)
  const hasWork = blocks.some(block => block.type === 'work')
  return <div className="assistant-turn">
    {work?.compacting === true ? <CompactionProgress /> : null}
    {message.compacted === undefined ? null : <CompactionNotice tokensBefore={message.compacted.before}
      tokensAfter={message.compacted.after} isStreaming={running && blocks.length === 0} />}
    {blocks.map(block => block.type === 'text'
      ? <div className="working-answer" key={block.key}><Markdown>{block.text}</Markdown></div>
      : <WorkBlock key={block.key} activity={block.parts}
          expanded={work?.expandedBlocks?.[block.key] ?? expanded}
          running={running}
          label={label} note={note}
          onExpandedChange={value => onExpandedChange(value, block.key)} />)}
    {work?.retry !== undefined && !hasWork
      ? <div className={running ? 'working-status shimmer-text' : 'working-status'} role="status">{label}</div>
      : null}
    {work?.retry !== undefined || work?.error !== undefined || onRetry !== undefined
      ? <RetryNotice retry={work?.retry} error={work?.error} onRetry={onRetry} />
      : !hasWork && note ? <div className="working-status" role="status">{note}</div> : null}
    {work?.status === 'completed' && blocks.length === 0 ? <div className="working-status">{t('work.empty')}</div> : null}
  </div>
}
