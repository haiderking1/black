import React, { type ReactNode } from 'react'
import { AlertCircle, Info, Lightbulb, OctagonAlert, TriangleAlert } from 'lucide-react'

import type { AlertKind, AlertPresentation } from './types'

const ALERT_CONFIG: Record<AlertKind, Omit<AlertPresentation, 'kind'>> = {
  note: {
    label: 'Note',
    Icon: Info,
    accentClass: 'alert-note',
  },
  tip: {
    label: 'Tip',
    Icon: Lightbulb,
    accentClass: 'alert-tip',
  },
  important: {
    label: 'Important',
    Icon: AlertCircle,
    accentClass: 'alert-important',
  },
  warning: {
    label: 'Warning',
    Icon: TriangleAlert,
    accentClass: 'alert-warning',
  },
  caution: {
    label: 'Caution',
    Icon: OctagonAlert,
    accentClass: 'alert-caution',
  },
}

export function isAlertKind(value: string | undefined): value is AlertKind {
  return value !== undefined && value.toLowerCase() in ALERT_CONFIG
}

export interface AlertCalloutProps {
  kind: AlertKind
  children: ReactNode
}

export function AlertCallout({ kind, children }: AlertCalloutProps): React.JSX.Element {
  const config = ALERT_CONFIG[kind] ?? ALERT_CONFIG.note
  const { label, Icon, accentClass } = config

  return (
    <div role="note" className={`markdown-alert ${accentClass}`}>
      <div className="markdown-alert-header">
        <Icon size={14} className="markdown-alert-icon" aria-hidden="true" />
        <span className="markdown-alert-title">{label}</span>
      </div>
      <div className="markdown-alert-content">{children}</div>
    </div>
  )
}
