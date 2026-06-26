/** 레이더 차트 UI 헬퍼 */

export function scoreBarColor(score: number): string {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#60a5fa'
  if (score >= 40) return '#f0b429'
  return '#f87171'
}
