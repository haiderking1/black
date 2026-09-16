import React, { useState } from 'react'
import { Terminal } from 'lucide-react'

import { imageDataUrl, isRunning, type ToolRun } from '../chat/toolRun'
import { PreviewImage } from '../lightbox'
import { DiffView } from './DiffView'
import { FileMark } from './FileMark'
import computeIcon from './icons/compute.svg'
import { rowLabel } from './rowLabel'
import { useLanguage } from '../language'
import { t } from '../i18n'
import './tools.css'

function Caret({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      className={open ? 'tool-caret tool-caret-open' : 'tool-caret'}
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 2.5 L8 6 L4.5 9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ToolRow({ run }: { run: ToolRun }): React.JSX.Element {
  const language = useLanguage()
  const running = isRunning(run)
  const failed = run.isError === true
  const images = run.images ?? []
  const [open, setOpen] = useState(false)

  const label = rowLabel(run, language)
  const detail = failed ? run.result ?? run.diff : run.diff ?? run.result
  const rawInput = label.command ?? (run.result === undefined ? run.args : undefined)
  const trimmedInput = rawInput?.trim()
  const input = trimmedInput === undefined || trimmedInput === '' || trimmedInput === '{}' ? undefined : rawInput
  const hasBody = detail !== undefined || images.length > 0 || input !== undefined
  const expanded = failed || images.length > 0 || open

  return (
    <div className={'tool-row' + (failed ? ' tool-row-failed' : '')}>
      <button
        type="button"
        className="tool-row-head"
        onClick={() => setOpen((previous) => !previous)}
        disabled={!hasBody}
        aria-expanded={expanded}
        aria-label={[label.verb, label.name, label.note, label.added === undefined ? '' : '+' + label.added, label.removed === undefined ? '' : '-' + label.removed, failed ? t(language, 'tool.failed') : ''].filter(Boolean).join(' ')}
        {...(run.path === undefined ? {} : { title: run.path })}
      >
        {run.name === 'compute' ? (
          <span className="tool-mark" aria-hidden="true">
            <img src={computeIcon} alt="" width="16" height="16" />
          </span>
        ) : run.name === 'bash' ? <span className="tool-mark" aria-hidden="true"><Terminal size={16} /></span> : <FileMark path={run.path ?? ''} />}
        <span className={'tool-row-label' + (running ? ' shimmer-text' : '')}>
          <span className="tool-row-verb">{label.verb}</span>
          {label.name === '' ? null : <span className="tool-row-file">{label.name}</span>}
          {label.note === undefined ? null : <span className="tool-row-note">{label.note}</span>}
        </span>
        {label.added === undefined ? null : (
          <span className="tool-row-count tool-row-count-added">+{label.added}</span>
        )}
        {label.removed === undefined ? null : (
          <span className="tool-row-count tool-row-count-removed">-{label.removed}</span>
        )}
        {failed ? <span className="tool-row-state">{t(language, 'tool.failed')}</span> : run.interrupted ? <span className="tool-row-state">{t(language, 'tool.interrupted')}</span> : null}
        <span className="tool-row-caret">{hasBody ? <Caret open={expanded} /> : null}</span>
      </button>

      {expanded && hasBody ? (
        <div className="tool-row-body">
          {input === undefined ? null : <pre className="tool-output">{input}</pre>}
          {images.map((image, index) => (
            <PreviewImage
              key={String(index) + image.mimeType}
              className="tool-image"
              src={imageDataUrl(image)}
              {...(run.path === undefined ? {} : { name: run.path })}
              alt={t(language, 'tool.readImageAlt')}
            />
          ))}
          {detail === undefined ? null : failed || run.diff === undefined ? (
            <pre className="tool-output">{detail}</pre>
          ) : (
            <DiffView diff={detail} />
          )}
        </div>
      ) : null}
    </div>
  )
}
