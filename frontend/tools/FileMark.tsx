import React from 'react'
import { markFor } from './icons/selectIcon'

export function FileMark({ path }: { path: string }): React.JSX.Element {
  const Icon = markFor(path)
  return (
    <span className="tool-mark" aria-hidden="true">
      {typeof Icon === 'string' ? <img src={Icon} alt="" className="tool-mark-glyph" /> : <Icon size={14} strokeWidth={1.5} />}
    </span>
  )
}
