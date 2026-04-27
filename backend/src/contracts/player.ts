// 프론트 src/types/player.ts, src/types/match.ts와 같은 shape.
// 백엔드-프론트 직접 import 의존성을 피하려고 따로 정의해뒀다.
// shape 바꾸면 src/types 쪽도 맞춰야 함.

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
