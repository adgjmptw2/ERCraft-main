import { useEffect, useState } from 'react'

const DEFAULT_DELAY_MS = 500

export function useDebounce<T>(value: T, delay: number = DEFAULT_DELAY_MS): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])

  return debounced
}
