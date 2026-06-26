import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useDeferredProfileMatches } from '@/hooks/useDeferredProfileMatches'

const isRealModeMock = vi.fn(() => true)

vi.mock('@/api/erClient', () => ({
  isRealMode: () => isRealModeMock(),
}))

describe('useDeferredProfileMatches', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    isRealModeMock.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('real mode — summary 대기 중 matches 비활성', () => {
    const { result } = renderHook(() =>
      useDeferredProfileMatches('player', true, false),
    )
    expect(result.current).toBe(false)
  })

  it('real mode — summary 성공 시 즉시 활성', () => {
    const { result } = renderHook(() =>
      useDeferredProfileMatches('player', true, true),
    )
    expect(result.current).toBe(true)
  })

  it('real mode — summary 실패해도 지연 후 활성', () => {
    const { result } = renderHook(() =>
      useDeferredProfileMatches('player', true, false),
    )
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe(true)
  })

  it('mock mode — summaryReady 연동', () => {
    isRealModeMock.mockReturnValue(false)
    const { result, rerender } = renderHook(
      ({ ready }) => useDeferredProfileMatches('player', true, ready),
      { initialProps: { ready: false } },
    )
    expect(result.current).toBe(false)
    rerender({ ready: true })
    expect(result.current).toBe(true)
  })
})
