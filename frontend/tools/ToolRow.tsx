import React, { useState } from 'react'

import { imageDataUrl, isRunning, type ToolRun } from '../chat/toolRun'
import { PreviewImage } from '../lightbox'
import { DiffView } from './DiffView'
import './tools.css'

/**
 * One tool call in the transcript.
 *
 * Collapsed by default, because the point of the row is that the reader can see
 * what happened without reading a file to find out. The arguments summary is
 * always visible; the output is one click away.
 *
 * A failed call stays open, and so does one that returned an image. An error
 * that has to be clicked to be seen is an error the reader will assume was
 * fine, and a picture behind a click is a picture nobody looks at.
 */
export function ToolRow({ run }: { run: ToolRun }): React.JSX.Element {
  const running = isRunning(run)
  const failed = run.isError === true
  const images = run.images ?? []
  const [open, setOpen] = useState(false)

  const detail = run.diff ?? run.result
  const hasBody = detail !== undefined || images.length > 0
  const expanded = failed || images.length > 0 || open

  return (
    <div className={'tool-row' + (failed ? ' tool-row-failed' : '') + (running ? ' tool-row-running' : '')}>
      <button
        type="button"
        className="tool-row-head"
        onClick={() => setOpen((previous) => !previous)}
        disabled={!hasBody}
        aria-expanded={expanded}
      >
        <span className="tool-row-chevron" aria-hidden="true">
          {hasBody ? (expanded ? '\u25be' : '\u25b8') : ''}
        </span>
        <span className={'tool-row-name' + (running ? ' shimmer-text' : '')}>{run.name}</span>
        <span className="tool-row-summary">{run.summary}</span>
        {failed ? <span className="tool-row-state">failed</span> : null}
      </button>

      {expanded && hasBody ? (
        <div className="tool-row-body">
          {images.map((image, index) => (
            <PreviewImage
              key={String(index) + image.mimeType}
              className="tool-image"
              src={imageDataUrl(image)}
              /* The path the read tool resolved, which is what tells two
                 screenshots apart when both are called shot.png. */
              {...(run.path === undefined ? {} : { name: run.path })}
              alt="Image returned by the read tool"
            />
          ))}
          {detail === undefined ? null : run.diff === undefined ? (
            <pre className="tool-output">{detail}</pre>
          ) : (
            <DiffView diff={detail} />
          )}
        </div>
      ) : null}
    </div>
  )
}

/** The calls made during one turn, in the order they were asked for. */
export function ToolRunList({ runs }: { runs: readonly ToolRun[] }): React.JSX.Element | null {
  if (runs.length === 0) {
    return null
  }
  return (
    <div className="tool-runs">
      {runs.map((run) => (
        <ToolRow key={run.id} run={run} />
      ))}
    </div>
  )
}
