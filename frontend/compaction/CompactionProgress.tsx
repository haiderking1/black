import React from 'react'

import { useT } from '../i18n'
import './compaction.css'

export function CompactionProgress(): React.JSX.Element {
  const t = useT()
  return (
    <div className="compaction-progress shimmer-text" role="status" aria-live="polite">
      {t('compact.progress')}
    </div>
  )
}
