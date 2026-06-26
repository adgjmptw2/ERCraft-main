/**
 * @deprecated 37단계 — 프로필 최초 진입 시 자동 전 페이지 수집 금지.
 * 추가 경기는 useLoadAdditionalMatchPages + matches infinite query 사용.
 */
export function usePrefetchRpTrendMatches(): void {
  // intentionally no-op — RP 차트는 현재 로드된 matches만 사용
}
