import React from 'react'

import type { ToolRun } from '../chat/toolRun'
import { ToolRow } from './ToolRow'

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
