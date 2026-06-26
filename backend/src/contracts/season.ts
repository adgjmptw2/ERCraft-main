/** BSER 시즌별 전적 — 프론트 시즌 그리드/스냅샷용 */

export interface SeasonRankContract {
  tier: string
  division?: number
  rp: number
  rank?: number
}

export interface SeasonRecordContract {
  seasonNumber: number
  rank: SeasonRankContract
  tier: string
  wins: number
  losses: number
  games: number
  avgPlacement: number
  kda: number
  top3Rate: number
  winRate: number
  /** 해당 시즌 랭크 대전 기록 존재 여부 */
  played: boolean
}

export interface PlayerSeasonsContract {
  currentSeason: number
  seasons: SeasonRecordContract[]
  owner?: {
    nickname: string
    userNum: number
  }
  source?: {
    count: number
    strategy: 'canonical' | 'verified-alias'
  }
  requestedRange?: {
    from: number
    to: number
  }
  status?: 'complete' | 'partial'
}
