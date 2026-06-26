import { useEffect, useState } from 'react'

import { isRealMode } from '@/api/erClient'

/** real mode — summary/stats/seasons 우선, matches는 짧게 지연 또는 summary 성공 후 시작 */
const MATCHES_DEFER_MS = 250

export function useDeferredProfileMatches(
  nickname: string,
  profileDataEnabled: boolean,
  summaryReady: boolean,
): boolean {
  const realMode = isRealMode()
  const deferKey = `${nickname}:${profileDataEnabled}:${realMode}:${summaryReady}`
  const [deferState, setDeferState] = useState({ key: deferKey, ready: false })

  if (deferState.key !== deferKey) {
    setDeferState({ key: deferKey, ready: false })
  }

  const shouldDefer = realMode && profileDataEnabled && !summaryReady

  useEffect(() => {
    if (!shouldDefer) return
    const timer = setTimeout(() => {
      setDeferState((prev) => (prev.key === deferKey ? { key: deferKey, ready: true } : prev))
    }, MATCHES_DEFER_MS)
    return () => clearTimeout(timer)
  }, [deferKey, shouldDefer])

  if (!profileDataEnabled) return false
  if (!realMode) return summaryReady
  if (summaryReady) return true
  return deferState.ready
}
