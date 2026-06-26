/** 현재 시즌 중심 프로필 — RP 추이는 39.10E에서 UI/query 제외 */
export const PROFILE_RP_TREND_ENABLED = false

export const PAST_SEASON_RECORDS_NOTICE =
  '이전 시즌 전적 조회는 지원하지 않습니다. 현재 시즌 전적만 분석합니다.'

export const PAST_SEASON_ANALYSIS_UNAVAILABLE = '현재 시즌 분석만 제공합니다.'

export function isPastSeasonNumber(seasonNumber: number, currentSeason: number): boolean {
  return Number.isFinite(seasonNumber) && Number.isFinite(currentSeason) && seasonNumber < currentSeason
}

export function isSeasonChipSelectable(
  seasonNumber: number,
  currentSeason: number,
  disablePastSeasonSelection: boolean,
): boolean {
  if (!disablePastSeasonSelection) return true
  return !isPastSeasonNumber(seasonNumber, currentSeason)
}

export function isCurrentSeasonView(selectedSeason: number, currentSeason: number): boolean {
  return Number.isFinite(selectedSeason) && selectedSeason === currentSeason
}

export function profileIdentityKey(nickname: string, userNum: number): string {
  return `${nickname.trim().toLowerCase()}:${userNum}`
}

/** 이전 유저 데이터 차단 — route nickname과 summary 일치 여부 */
export function summaryMatchesRouteNickname(
  summary: { nickname: string } | null | undefined,
  routeNickname: string,
): boolean {
  if (!summary) return false
  return summary.nickname.trim().toLowerCase() === routeNickname.trim().toLowerCase()
}
