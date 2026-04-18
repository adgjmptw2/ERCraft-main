export interface RankingEntry {
  rank: number
  userNum: number
  nickname: string
  tier: string
  mmr: number
  games: number
  wins: number
}

export interface MmrProjection {
  userNum: number
  currentMmr: number
  projectedMmr: number
  confidence: number
  rationale: string
}
