import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Drives layout that cannot be expressed in CSS alone. The settings panel docks
 * beside the viewport on a wide screen and slides in from the left on a narrow
 * one, and it has to be one instance either way — rendering it twice and hiding
 * one copy would duplicate every control's id and label.
 */
export function useMediaQuery(query: string): boolean {
  const list = useMemo(() => window.matchMedia(query), [query])
  const subscribe = useCallback(
    (onChange: () => void) => {
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [list],
  )
  return useSyncExternalStore(subscribe, () => list.matches)
}
