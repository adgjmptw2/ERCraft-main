// 프론트 src/types/player.ts, src/types/match.ts와 동일한 shape 유지.
// 백엔드-프론트 간 직접 import 의존성을 피하기 위해 별도 정의.
// shape 변경 시 프론트 타입도 함께 확인할 것.

export interface PlayerSummaryContract {
  userNum: number
  nickname: string
  level: number
  tier: string
  profileImageUrl?: string
}

export interface PlayerStatsContract {
  userNum: number
  seasonId: number
  games: number
  wins: number
  losses: number
  kills: number
  deaths: number
  assists: number
  top3: number
  mmr: number
}

export interface MatchSummaryContract {
  matchId: string
  userNum: number
  characterName: string
  placement: number
  kills: number
  deaths: number
  assists: number
  gameStartedAt: string
  victory: boolean
}

export interface PaginatedContract<T> {
  items: T[]
  page: number
  pageSize: number
  hasNext: boolean
}
