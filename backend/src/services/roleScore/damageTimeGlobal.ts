import damageTimeGlobalDoc from '../../data/roleTimeCurve/damage-time-global.v1.json' with { type: 'json' }

export const DAMAGE_TIME_GLOBAL_VERSION = damageTimeGlobalDoc.version

export type DamageTimePolicy =
  | 'legacy-duration-multiplier'
  | 'blend-legacy-to-global'
  | 'global'
  | 'blend-global-to-legacy'

export interface DamageTimeMultiplierResult {
  presetVersion: typeof DAMAGE_TIME_GLOBAL_VERSION
  policy: DamageTimePolicy
  multiplier: number
  legacyMultiplier: number
  globalMultiplier: number | null
  sampleCount: number | null
}

type Point = {
  minute: number
  multiplier: number
  sampleCount: number
}

const points = [...damageTimeGlobalDoc.points].sort((a, b) => a.minute - b.minute) as Point[]

function round(value: number, digits = 6): number {
  return Math.round(value * 10 ** digits) / 10 ** digits
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function interpolateGlobal(minutes: number): { multiplier: number; sampleCount: number | null } | null {
  if (!isFiniteNumber(minutes)) return null
  if (minutes <= points[0].minute) {
    return { multiplier: points[0].multiplier, sampleCount: points[0].sampleCount }
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index]
    const right = points[index + 1]
    if (minutes >= left.minute && minutes <= right.minute) {
      const progress = (minutes - left.minute) / (right.minute - left.minute)
      const multiplier = left.multiplier + (right.multiplier - left.multiplier) * progress
      const sampleCount = Math.round(left.sampleCount + (right.sampleCount - left.sampleCount) * progress)
      return { multiplier: round(multiplier), sampleCount }
    }
  }

  const last = points[points.length - 1]
  return { multiplier: last.multiplier, sampleCount: last.sampleCount }
}

export function resolveDamageTimeGlobalMultiplier(params: {
  durationSeconds: number | null | undefined
  legacyMultiplier: number
}): DamageTimeMultiplierResult {
  const legacyMultiplier = isFiniteNumber(params.legacyMultiplier) ? params.legacyMultiplier : 1
  const minutes =
    isFiniteNumber(params.durationSeconds) && params.durationSeconds > 0
      ? params.durationSeconds / 60
      : null

  if (minutes == null || minutes < 8 || minutes >= 25) {
    return {
      presetVersion: DAMAGE_TIME_GLOBAL_VERSION,
      policy: 'legacy-duration-multiplier',
      multiplier: round(legacyMultiplier),
      legacyMultiplier: round(legacyMultiplier),
      globalMultiplier: null,
      sampleCount: null,
    }
  }

  const global = interpolateGlobal(minutes)
  if (!global) {
    return {
      presetVersion: DAMAGE_TIME_GLOBAL_VERSION,
      policy: 'legacy-duration-multiplier',
      multiplier: round(legacyMultiplier),
      legacyMultiplier: round(legacyMultiplier),
      globalMultiplier: null,
      sampleCount: null,
    }
  }

  if (minutes < 10) {
    const weight = (minutes - 8) / 2
    return {
      presetVersion: DAMAGE_TIME_GLOBAL_VERSION,
      policy: 'blend-legacy-to-global',
      multiplier: round(legacyMultiplier * (1 - weight) + global.multiplier * weight),
      legacyMultiplier: round(legacyMultiplier),
      globalMultiplier: global.multiplier,
      sampleCount: global.sampleCount,
    }
  }

  if (minutes <= 20) {
    return {
      presetVersion: DAMAGE_TIME_GLOBAL_VERSION,
      policy: 'global',
      multiplier: global.multiplier,
      legacyMultiplier: round(legacyMultiplier),
      globalMultiplier: global.multiplier,
      sampleCount: global.sampleCount,
    }
  }

  const weight = (25 - minutes) / 5
  return {
    presetVersion: DAMAGE_TIME_GLOBAL_VERSION,
    policy: 'blend-global-to-legacy',
    multiplier: round(global.multiplier * weight + legacyMultiplier * (1 - weight)),
    legacyMultiplier: round(legacyMultiplier),
    globalMultiplier: global.multiplier,
    sampleCount: global.sampleCount,
  }
}
