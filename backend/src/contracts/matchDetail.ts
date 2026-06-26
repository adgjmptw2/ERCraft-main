import type { MatchSummaryContract } from './player.js'

export type MatchDetailStatus = 'ready' | 'unavailable'

export interface MatchParticipantContract {
  participantId: string
  uid?: string | null
  nickname?: string | null
  teamNumber?: number | null
  teamRank?: number | null
  placement: number
  characterNum: number
  characterName?: string | null
  skinCode?: number | null
  accountLevel?: number | null
  characterLevel?: number | null
  kills: number
  deaths: number
  assists: number
  teamKills?: number | null
  damageToPlayer?: number | null
  damageToMonster?: number | null
  damageTaken?: number | null
  credit?: number | null
  visionScore?: number | null
  rpAfter?: number | null
  rpDelta?: number | null
  bestWeapon?: number | null
  tacticalSkillGroup?: number | null
  traitFirstCore?: number | null
  traitFirstSub?: number[]
  traitSecondSub?: number[]
  equipment?: MatchSummaryContract['equipment']
  equipmentGrade?: MatchSummaryContract['equipmentGrade']
  cobaltInfusions?: number[]
  gameMode?: MatchSummaryContract['gameMode']
}

export interface MatchDetailTeamContract {
  teamNumber: number
  teamRank: number
  participants: MatchParticipantContract[]
}

export interface MatchDetailContract {
  gameId: string
  apiSeasonId?: number | null
  displaySeasonId?: number | null
  gameMode: MatchSummaryContract['gameMode']
  matchingMode?: number | null
  matchingTeamMode?: number | null
  playedAt: string
  durationSeconds?: number | null
  detailStatus: MatchDetailStatus
  teams: MatchDetailTeamContract[]
}
