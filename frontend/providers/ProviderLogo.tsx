import React from 'react'

import { OpenCodeLogo } from './OpenCodeLogo'
import './logo.css'

export interface ProviderLogoProps {
  providerId: string
  size?: number
  /** Used for the fallback mark when the provider id is all we have. */
  fallbackLabel?: string
}

/**
 * The mark for a provider.
 *
 * Vendor artwork where one exists, and a letter from the provider's own name
 * where it does not. A drawn stand-in for a logo that exists is worse than no
 * mark at all: it reads as the real thing while being wrong.
 */
export function ProviderLogo({
  providerId,
  size = 28,
  fallbackLabel,
}: ProviderLogoProps): React.JSX.Element {
  if (providerId === 'opencode-go' || providerId === 'opencode') {
    return <OpenCodeLogo size={size} />
  }

  const label = (fallbackLabel ?? providerId).trim()
  return (
    <span
      className="provider-logo-fallback"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) }}
      aria-hidden="true"
    >
      {(label[0] ?? '?').toUpperCase()}
    </span>
  )
}
