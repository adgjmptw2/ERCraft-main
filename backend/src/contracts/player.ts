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
