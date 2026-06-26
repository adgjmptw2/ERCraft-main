import baselineDoc from '../../data/roleScore/team-luck-role-score-baselines.v1.json' with { type: 'json' }

import type {
  TeamLuckRoleMetricBaseline,
} from './teamLuckRoleScore.js'
import { durationBucket } from './teamLuckRoleScore.js'
import type { CharacterGradeRole } from '../characterPerformanceGrade/config.js'

export const TEAM_LUCK_ROLE_SCORE_BASELINE_VERSION = baselineDoc.baselineVersion

type BaselineRecord = {
  count: number
  means: TeamLuckRoleMetricBaseline
}

const roleDuration = baselineDoc.roleDuration as Record<string, BaselineRecord>
const roleGlobal = baselineDoc.roleGlobal as Record<string, BaselineRecord>

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export interface RoleScoreBaselineLookupResult {
  baseline: TeamLuckRoleMetricBaseline | null
  fallbackLevel: 'role-duration' | 'role-global' | null
  sampleCount: number | null
}

export function resolveTeamLuckRoleScoreBaseline(params: {
  role: CharacterGradeRole
  durationSeconds: number | null | undefined
}): RoleScoreBaselineLookupResult {
  const bucket = durationBucket(params.durationSeconds)
  if (bucket !== 'unknown-duration') {
    const record = roleDuration[`role:${params.role}|duration:${bucket}`]
    if (record && isFinitePositiveNumber(record.count)) {
      return {
        baseline: record.means,
        fallbackLevel: 'role-duration',
        sampleCount: record.count,
      }
    }
  }

  const global = roleGlobal[`role:${params.role}`]
  if (global && isFinitePositiveNumber(global.count)) {
    return {
      baseline: global.means,
      fallbackLevel: 'role-global',
      sampleCount: global.count,
    }
  }

  return {
    baseline: null,
    fallbackLevel: null,
    sampleCount: null,
  }
}
