export interface PlayerSummary {
  userNum: number
  nickname: string
  level: number
  tier: string
  profileImageUrl?: string
}

export interface PlayerStats {
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
  /** loader에서 매치 합산 */
  winRate?: number
  avgKills?: number
  avgPlacement?: number
  aggregateKda?: number
}

export interface PlayerRanking {
  userNum: number
  rank: number
  tier: string
  lp: number
}

export interface NicknameHistoryEntry {
  nickname: string
  changedAt: string
}

export type NicknameHistory = NicknameHistoryEntry[]
