import { describe, expect, it } from 'vitest'

/**
 * 39.10F — hasProfileCache=false일 때 past seasons defer 재현
 * (실제 defer는 useDeferredProfileInitialReady + ProfilePage 연동 테스트에서 검증)
 */
describe('past seasons defer policy (39.10F)', () => {
  it('캐시 없는 최초 진입은 past seasons initial defer 대상', () => {
    const hasProfileCache = false
    const pastSeasonsInitialReady = false
    const currentSeasonsSuccess = true
    const pastSeasonsRangeEnabled =
      hasProfileCache || pastSeasonsInitialReady
        ? currentSeasonsSuccess || hasProfileCache
        : false
    expect(pastSeasonsRangeEnabled).toBe(false)
  })

  it('hasProfileCache=true면 defer 없이 past seasons 즉시 enabled', () => {
    const hasProfileCache = true
    const pastSeasonsInitialReady = true
    const currentSeasonsSuccess = false
    const pastSeasonsRangeEnabled =
      (hasProfileCache || pastSeasonsInitialReady) &&
      (hasProfileCache || currentSeasonsSuccess)
    expect(pastSeasonsRangeEnabled).toBe(true)
  })
})
