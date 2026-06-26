/** 가중 교전 기여 비율이며 공식 킬 관여율 지표가 아니다. */
export const COMBAT_CONTRIBUTION_FORMULA_NOTE =
  '가중 교전 기여 비율이며 공식 킬 관여율 지표가 아니다.' as const

export const COMBAT_CONTRIBUTION_ASSIST_WEIGHT = 0.7 as const

export type ParticipationMetricKey =
  | 'participationRaw'
  | 'participationCapped'
  | 'participationAssistWeighted_0.5'
  | 'participationAssistWeighted_0.7'
  | 'participationAssistWeighted_1.0'
  | 'participationZeroAsNull'
  | 'participationZeroAsZero'
  | 'finisherShare'

export interface CombatParticipationMatchInput {
  playerKill: number | null
  playerAssistant: number | null
  teamKill: number | null
}

export function computeParticipationRaw(
  input: CombatParticipationMatchInput,
): number | null {
  const { playerKill, playerAssistant, teamKill } = input
  if (
    playerKill == null ||
    playerAssistant == null ||
    teamKill == null ||
    !Number.isFinite(playerKill) ||
    !Number.isFinite(playerAssistant) ||
    !Number.isFinite(teamKill)
  ) {
    return null
  }
  if (teamKill <= 0) return null
  return (playerKill + playerAssistant) / teamKill
}

export function computeParticipationCapped(
  input: CombatParticipationMatchInput,
): number | null {
  const raw = computeParticipationRaw(input)
  if (raw == null) return null
  return Math.min(raw, 1)
}

export function computeCombatContributionRatio(
  input: CombatParticipationMatchInput,
  assistWeight: number = COMBAT_CONTRIBUTION_ASSIST_WEIGHT,
): number | null {
  return computeParticipationAssistWeighted(input, assistWeight)
}

export function computeParticipationAssistWeighted(
  input: CombatParticipationMatchInput,
  assistWeight: number,
): number | null {
  const { playerKill, playerAssistant, teamKill } = input
  if (
    playerKill == null ||
    playerAssistant == null ||
    teamKill == null ||
    !Number.isFinite(playerKill) ||
    !Number.isFinite(playerAssistant) ||
    !Number.isFinite(teamKill)
  ) {
    return null
  }
  if (teamKill <= 0) return null
  return (playerKill + playerAssistant * assistWeight) / teamKill
}

export function computeParticipationWithZeroTeamKill(
  input: CombatParticipationMatchInput,
  zeroMode: 'null' | 'zero',
): number | null {
  const { playerKill, playerAssistant, teamKill } = input
  if (
    playerKill == null ||
    playerAssistant == null ||
    teamKill == null ||
    !Number.isFinite(playerKill) ||
    !Number.isFinite(playerAssistant) ||
    !Number.isFinite(teamKill)
  ) {
    return null
  }
  if (teamKill <= 0) return zeroMode === 'zero' ? 0 : null
  return (playerKill + playerAssistant) / teamKill
}

export function computeFinisherShare(
  input: CombatParticipationMatchInput,
): number | null {
  const { playerKill, teamKill } = input
  if (
    playerKill == null ||
    teamKill == null ||
    !Number.isFinite(playerKill) ||
    !Number.isFinite(teamKill)
  ) {
    return null
  }
  if (teamKill <= 0) return null
  return playerKill / teamKill
}

export function resolveParticipationMetricValue(
  key: ParticipationMetricKey,
  input: CombatParticipationMatchInput,
): number | null {
  switch (key) {
    case 'participationRaw':
      return computeParticipationRaw(input)
    case 'participationCapped':
      return computeParticipationCapped(input)
    case 'participationAssistWeighted_0.5':
      return computeParticipationAssistWeighted(input, 0.5)
    case 'participationAssistWeighted_0.7':
      return computeParticipationAssistWeighted(input, 0.7)
    case 'participationAssistWeighted_1.0':
      return computeParticipationAssistWeighted(input, 1.0)
    case 'participationZeroAsNull':
      return computeParticipationWithZeroTeamKill(input, 'null')
    case 'participationZeroAsZero':
      return computeParticipationWithZeroTeamKill(input, 'zero')
    case 'finisherShare':
      return computeFinisherShare(input)
    default:
      return null
  }
}

export const PARTICIPATION_BASELINE_METRICS: ParticipationMetricKey[] = [
  'participationRaw',
  'participationCapped',
  'participationAssistWeighted_0.5',
  'participationAssistWeighted_0.7',
  'participationAssistWeighted_1.0',
  'finisherShare',
]
