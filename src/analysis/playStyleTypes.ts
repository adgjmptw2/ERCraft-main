import type { ProductionAnalysisAxisRowDTO } from '@/types/player'

export const ANALYSIS_AXES = [
  'survival',
  'combat',
  'macro',
  'support',
  'finish',
  'consistency',
] as const

export type AnalysisAxis = (typeof ANALYSIS_AXES)[number]
export type PlayStyleAxis = AnalysisAxis | 'clutch'

export const ANALYSIS_AXIS_LABELS: Record<AnalysisAxis, string> = {
  survival: '생존',
  combat: '교전',
  macro: '운영',
  support: '지원',
  finish: '마무리',
  consistency: '일관성',
}

export const PLAYER_ROLES = [
  'basicAttackDealer',
  'skillAmpDealer',
  'bruiser',
  'support',
  'tank',
  'assassin',
] as const

export type PlayerRole = (typeof PLAYER_ROLES)[number]
export type PlayStyleRole = PlayerRole | 'dealer'

export const PLAYER_ROLE_LABELS: Record<PlayerRole, string> = {
  basicAttackDealer: '평타 딜러',
  skillAmpDealer: '스킬 딜러',
  bruiser: '브루저',
  support: '서폿',
  tank: '탱커',
  assassin: '암살자',
}

export type AxisScores = Partial<Record<PlayStyleAxis, number>>

export type RoleFitScores = Partial<Record<PlayStyleRole, number>>

export interface PlayStyleRadarChartPoint {
  subject: string
  axis: PlayStyleAxis
  value: number
  tierAvg: number
  fullMark: number
}

export interface PlayerPlayStyleAnalysis {
  status: 'ok' | 'insufficient'
  sampleSize: number
  axisScores: AxisScores
  tierAverageAxes: AxisScores
  roleFitScores: RoleFitScores
  primaryRole: PlayStyleRole | null
  secondaryRole: PlayStyleRole | null
  roleConfidence?: 'low' | 'medium' | 'high'
  roleReasonSummary?: string
  unavailableMetrics: string[]
  overallScore: number | null
  strengths: string[]
  improvements: string[]
  comment: string
  chartData: PlayStyleRadarChartPoint[]
  axisDetails?: ProductionAnalysisAxisRowDTO[]
  basisLabel: string
}
