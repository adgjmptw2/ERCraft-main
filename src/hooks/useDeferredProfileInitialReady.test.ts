import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { useDeferredProfileInitialReady } from '@/hooks/useDeferredProfileInitialReady'

describe('useDeferredProfileInitialReady', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deferKey null이면 비활성', () => {
    const { result } = renderHook(() => useDeferredProfileInitialReady(null, false, 400))
    expect(result.current).toBe(false)
  })

  it('캐시 hit이면 즉시 활성', () => {
    const { result } = renderHook(() =>
      useDeferredProfileInitialReady('player:1', true, 400),
    )
    expect(result.current).toBe(true)
  })

  it('캐시 miss면 deferMs 후 활성', () => {
    const { result } = renderHook(() =>
      useDeferredProfileInitialReady('player:1', false, 400),
    )
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(true)
  })

  it('deferKey 변경 시 ready reset', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) => useDeferredProfileInitialReady(key, false, 400),
      { initialProps: { key: 'a:1' as string | null } },
    )
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(true)
    rerender({ key: 'b:2' })
    expect(result.current).toBe(false)
  })
})
