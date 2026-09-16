import type { ComponentType } from 'react'

export interface MarkdownProps {
  children: string
  /**
   * Honour single newlines as line breaks.
   *
   * Off for answers, where prose is often hard-wrapped and forcing a break at
   * every newline leaves ragged lines on a wide window. On for reasoning, which
   * tends to put one thought per line, and where collapsing those newlines would
   * run separate thoughts together into one sentence.
   */
  breaks?: boolean
}

export interface CodeBlockProps {
  language: string
  code: string
  fenceTitle?: string | null
}

export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution'

export interface AlertPresentation {
  kind: AlertKind
  label: string
  Icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  accentClass: string
}
