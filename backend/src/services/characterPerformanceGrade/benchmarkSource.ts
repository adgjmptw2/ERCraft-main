export const CHARACTER_GRADE_BENCHMARK_SOURCE_VALUES = [
  'fixed-v1',
  'fixed-v2',
  'experimental-local',
  'legacy',
] as const

export type CharacterGradeBenchmarkSource =
  (typeof CHARACTER_GRADE_BENCHMARK_SOURCE_VALUES)[number]

export interface CharacterGradeBenchmarkSourceResolution {
  configured: string
  effective: CharacterGradeBenchmarkSource
  valid: boolean
  liveRoleCombatEnabled: boolean
  reason: 'configured' | 'unset-default' | 'unsupported-value' | 'fixed-v2-unavailable'
}

const DEFAULT_SOURCE: CharacterGradeBenchmarkSource = 'fixed-v1'

function isKnownSource(value: string): value is CharacterGradeBenchmarkSource {
  return (CHARACTER_GRADE_BENCHMARK_SOURCE_VALUES as readonly string[]).includes(value)
}

export function resolveCharacterGradeBenchmarkSource(
  raw: string | undefined = process.env.CHARACTER_GRADE_BENCHMARK_SOURCE,
): CharacterGradeBenchmarkSourceResolution {
  const configured = raw?.trim() ?? ''
  if (!configured) {
    return {
      configured: DEFAULT_SOURCE,
      effective: DEFAULT_SOURCE,
      valid: true,
      liveRoleCombatEnabled: false,
      reason: 'unset-default',
    }
  }

  if (!isKnownSource(configured)) {
    return {
      configured,
      effective: DEFAULT_SOURCE,
      valid: false,
      liveRoleCombatEnabled: false,
      reason: 'unsupported-value',
    }
  }

  if (configured === 'fixed-v2') {
    return {
      configured,
      effective: DEFAULT_SOURCE,
      valid: true,
      liveRoleCombatEnabled: false,
      reason: 'fixed-v2-unavailable',
    }
  }

  return {
    configured,
    effective: configured,
    valid: true,
    liveRoleCombatEnabled: configured === 'experimental-local',
    reason: 'configured',
  }
}

export function isExperimentalLocalBenchmarkSourceEnabled(): boolean {
  return resolveCharacterGradeBenchmarkSource().liveRoleCombatEnabled
}
