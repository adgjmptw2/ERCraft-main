import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  matchDetailPendingMessage,
  useMatchDetailPendingPhase,
} from '@/hooks/useMatchDetailPendingPhase'

describe('useMatchDetailPendingPhase', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('활성화 시 checking → queued → loading 순으로 전환', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ active }) => useMatchDetailPendingPhase(active),
      { initialProps: { active: true } },
    )

    expect(result.current).toBe('checking')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('queued')
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(result.current).toBe('loading')

    rerender({ active: false })
    expect(result.current).toBe('idle')
  })
})

describe('matchDetailPendingMessage', () => {
  it('단계별 메시지를 반환한다', () => {
    expect(matchDetailPendingMessage('checking')).toBe('캐시 확인 중…')
    expect(matchDetailPendingMessage('queued')).toBe('매치 상세 요청 대기 중…')
    expect(matchDetailPendingMessage('loading')).toBe('매치 상세 불러오는 중…')
  })
})
