import { useEffect, useState } from 'react'

/** summary 이후 aggregate/past-seasons 요청을 짧게 지연 — 캐시 hit 시 즉시 활성 */
export function useDeferredProfileInitialReady(
  deferKey: string | null,
  hasCached: boolean,
  deferMs: number,
): boolean {
  const stateKey = deferKey ?? ''
  const cacheHit = deferKey != null && hasCached
  const [state, setState] = useState({ key: stateKey, ready: cacheHit })

  if (state.key !== stateKey) {
    setState({ key: stateKey, ready: cacheHit })
  }

  useEffect(() => {
    if (deferKey == null || hasCached) return
    const timer = window.setTimeout(() => {
      setState((prev) => (prev.key === stateKey ? { key: stateKey, ready: true } : prev))
    }, deferMs)
    return () => window.clearTimeout(timer)
  }, [deferKey, deferMs, hasCached, stateKey])

  if (deferKey == null) return false
  if (hasCached) return true
  return state.ready
}
