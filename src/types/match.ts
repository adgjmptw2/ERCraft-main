export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  hasNext: boolean
}

export interface MatchSummary {
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

export interface MatchDetail extends MatchSummary {
  damageToPlayers?: number
  visionScore?: number
}
