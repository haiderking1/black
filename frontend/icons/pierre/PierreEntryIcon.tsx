import React, { memo, useEffect, useInsertionEffect, useMemo } from 'react'
import { File, Folder } from 'lucide-react'

import { getIconColor } from './colors'
import { resolvePierreIconForEntry } from './resolver'
import { ensurePierreIconSprite } from './sprite'
import type { EntryKind, IconThemeMode } from './types'

export interface PierreEntryIconProps {
  pathValue: string
  kind?: EntryKind
  theme?: IconThemeMode
  className?: string
  style?: React.CSSProperties
  size?: number
}

// React 18/19 safe insertion effect for DOM sprite injection
const useSafeInsertionEffect = typeof window !== 'undefined' ? (useInsertionEffect ?? useEffect) : useEffect

export const PierreEntryIcon = memo(function PierreEntryIcon({
  pathValue,
  kind = 'file',
  theme = 'dark',
  className,
  style,
  size = 14,
}: PierreEntryIconProps): React.JSX.Element {
  useSafeInsertionEffect(ensurePierreIconSprite, [])

  const icon = useMemo(
    () => resolvePierreIconForEntry(pathValue, kind),
    [pathValue, kind]
  )

  if (!icon) {
    return kind === 'directory' ? (
      <Folder size={size} className={className} style={style} aria-hidden="true" />
    ) : (
      <File size={size} className={className} style={style} aria-hidden="true" />
    )
  }

  const color = getIconColor(icon.token, theme)

  return (
    <svg
      aria-hidden="true"
      data-pierre-icon={icon.name}
      data-icon-token={icon.token}
      className={className}
      style={{ color, ...style }}
      viewBox="0 0 16 16"
      width={size}
      height={size}
    >
      <use href={`#${icon.name}`} />
    </svg>
  )
})
