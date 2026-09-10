import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { Lightbox } from './Lightbox'

/**
 * Full size previews, from anywhere an image appears.
 *
 * The overlay is mounted once at the top of the app and every image opens it.
 * A preview owned by each thumbnail would mean one overlay per image, all of
 * them listening for Escape at the same time.
 */

export interface PreviewRequest {
  src: string
  /** Shown beneath the image. Absent for something that never had a name. */
  name?: string
}

interface PreviewContextValue {
  open(request: PreviewRequest): void
}

const PreviewContext = createContext<PreviewContextValue | null>(null)

/**
 * Throws rather than doing nothing when there is no provider.
 *
 * A missing provider would otherwise turn every image in the app into a
 * harmless no-op click, which is a bug that looks like a design decision.
 */
export function usePreview(): PreviewContextValue {
  const value = useContext(PreviewContext)
  if (value === null) {
    throw new Error('usePreview was used outside PreviewProvider')
  }
  return value
}

export function PreviewProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [current, setCurrent] = useState<PreviewRequest | null>(null)

  const open = useCallback((request: PreviewRequest) => {
    setCurrent(request)
  }, [])

  const close = useCallback(() => {
    setCurrent(null)
  }, [])

  const value = useMemo(() => ({ open }), [open])

  return (
    <PreviewContext.Provider value={value}>
      {children}
      {current === null ? null : <Lightbox request={current} onClose={close} />}
    </PreviewContext.Provider>
  )
}
