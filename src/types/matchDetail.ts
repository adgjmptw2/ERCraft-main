import type { GameMode } from '@/utils/gameMode'
import type { MatchSummary } from '@/types/match'

export type MatchDetailStatus = 'ready' | 'unavailable'

export interface MatchParticipantDetail {
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
  equipment?: MatchSummary['equipment']
  equipmentGrade?: MatchSummary['equipmentGrade']
  cobaltInfusions?: number[]
  gameMode?: GameMode
}

export interface MatchDetailTeam {
  teamNumber: number
  teamRank: number
  participants: MatchParticipantDetail[]
}

export interface MatchDetailDTO {
  gameId: string
  apiSeasonId?: number | null
  displaySeasonId?: number | null
  gameMode: GameMode
  matchingMode?: number | null
  matchingTeamMode?: number | null
  playedAt: string
  durationSeconds?: number | null
  detailStatus: MatchDetailStatus
  teams: MatchDetailTeam[]
}
