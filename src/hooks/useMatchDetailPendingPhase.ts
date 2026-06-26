import { useEffect, useState } from 'react'

export type MatchDetailPendingPhase = 'idle' | 'checking' | 'queued' | 'loading'

const CHECKING_MS = 250
const QUEUED_MS = 900

export function useMatchDetailPendingPhase(isActive: boolean): MatchDetailPendingPhase {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!isActive) {
      return undefined
    }

    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 100)

    return () => {
      window.clearInterval(interval)
    }
  }, [isActive])

  if (!isActive) {
    return 'idle'
  }
  if (elapsedMs >= QUEUED_MS) {
    return 'loading'
  }
  if (elapsedMs >= CHECKING_MS) {
    return 'queued'
  }
  return 'checking'
}

export function matchDetailPendingMessage(phase: MatchDetailPendingPhase): string {
  switch (phase) {
    case 'checking':
      return '캐시 확인 중…'
    case 'queued':
      return '매치 상세 요청 대기 중…'
    case 'loading':
      return '매치 상세 불러오는 중…'
    default:
      return '매치 상세 불러오는 중…'
  }
}
