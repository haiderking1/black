import { useCallback, useState } from 'react'

import { loadFavourites, saveFavourites, toggleFavourite } from './favourites'

export interface UseFavouritesResult {
  favourites: readonly string[]
  toggle: (modelId: string) => void
}

/**
 * Favourite models, read once and written on every change.
 *
 * Read lazily on first use rather than at module load, so a module imported in a
 * context without a browser store does not touch one.
 */
export function useFavourites(): UseFavouritesResult {
  const [favourites, setFavourites] = useState<readonly string[]>(loadFavourites)

  const toggle = useCallback((modelId: string): void => {
    setFavourites((previous) => {
      const next = toggleFavourite(previous, modelId)
      saveFavourites(next)
      return next
    })
  }, [])

  return { favourites, toggle }
}
