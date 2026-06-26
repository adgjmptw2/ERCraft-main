#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { computeLegacyMatchPerformanceGradeForCalibration } from '../dist/services/characterPerformanceGrade/compute.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { normalizeRankTier } from '../dist/utils/rankTier.js'
import {
  resolveResidualRoleBaseline,
  TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
} from '../dist/services/teamLuckResidualBaseline.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'src', 'data', 'matchGradePercentileCalibration')
const outputPath = join(outputDir, 'match-grade-percentile-calibration.v2.json')

const prisma = new PrismaClient()
const ARTIFACT_VERSION = 'match-grade-percentile-calibration.v2'
const MATCH_GRADE_VERSION = 'match-grade-p4-percentile.v2'
const TARGET_QUANTILES = [0.01, 0.05, 0.1, 0.25, 0.5, 0.7, 0.8, 0.84, 0.88, 0.9, 0.95, 0.99]
const FIXED_GATES = {
  sFamily: 0.844094,
  s: 0.881077,
  sPlus: 0.957333,
}

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function quantile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const index = (sortedValues.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedValues[lower]
  const weight = index - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

function gradeRank(grade) {
  return {
    'S+': 15,
    S: 14,
    'S-': 13,
    'A+': 12,
    A: 11,
    'A-': 10,
    'B+': 9,
    B: 8,
    'B-': 7,
    'C+': 6,
    C: 5,
    'C-': 4,
    'D+': 3,
    D: 2,
    'D-': 1,
  }[grade] ?? 0
}

function ratio(rows, predicate) {
  return rows.length > 0 ? round(rows.filter(predicate).length / rows.length) : 0
}

function splitByPlayedAt(rows) {
  const groups = new Map()
  for (const row of rows) {
    const group = groups.get(row.internalContestId) ?? {
      internalContestId: row.internalContestId,
      playedAtMs: row.playedAt.getTime(),
      rows: [],
    }
    group.rows.push(row)
    if (row.playedAt.getTime() < group.playedAtMs) group.playedAtMs = row.playedAt.getTime()
    groups.set(row.internalContestId, group)
  }
  const sortedGroups = [...groups.values()].sort((a, b) => {
    if (a.playedAtMs !== b.playedAtMs) return a.playedAtMs - b.playedAtMs
    return a.internalContestId.localeCompare(b.internalContestId)
  })
  const calibrationGroupCount = Math.max(1, Math.floor(sortedGroups.length * 0.8))
  const calibrationIds = new Set(sortedGroups.slice(0, calibrationGroupCount).map((group) => group.internalContestId))
  const calibration = rows.filter((row) => calibrationIds.has(row.internalContestId))
  const holdout = rows.filter((row) => !calibrationIds.has(row.internalContestId))
  return {
    calibration,
    holdout,
    contests: {
      total: sortedGroups.length,
      calibration: calibrationGroupCount,
      holdout: sortedGroups.length - calibrationGroupCount,
    },
    leakageContestCount: 0,
    range: {
      calibrationFrom: calibration.length > 0 ? new Date(Math.min(...calibration.map((row) => row.playedAt.getTime()))).toISOString() : null,
      calibrationTo: calibration.length > 0 ? new Date(Math.max(...calibration.map((row) => row.playedAt.getTime()))).toISOString() : null,
      holdoutFrom: holdout.length > 0 ? new Date(Math.min(...holdout.map((row) => row.playedAt.getTime()))).toISOString() : null,
      holdoutTo: holdout.length > 0 ? new Date(Math.max(...holdout.map((row) => row.playedAt.getTime()))).toISOString() : null,
    },
  }
}

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank', displaySeasonId: CURRENT_DISPLAY_SEASON },
    select: {
      gameId: true,
      playedAt: true,
      displaySeasonId: true,
      gameMode: true,
      characterNum: true,
      placement: true,
      kills: true,
      deaths: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      victory: true,
      rpAfter: true,
      gameDuration: true,
      bestWeapon: true,
      roleMetricsVersion: true,
      viewContribution: true,
      monsterKill: true,
      damageFromPlayer: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      rawJson: true,
    },
  })

  const skipped = {
    invalidPlacement: 0,
    missingDuration: 0,
    missingTier: 0,
    missingRole: 0,
    missingGradeInput: 0,
    missingRoleScore: 0,
    missingResidualBaseline: 0,
  }
  const evaluated = []

  for (const row of rows) {
    if (!Number.isFinite(row.placement) || row.placement < 1 || row.placement > 8) {
      skipped.invalidPlacement += 1
      continue
    }
    if (!Number.isFinite(row.gameDuration) || row.gameDuration <= 0) {
      skipped.missingDuration += 1
      continue
    }
    const playerTier = normalizeRankTier({ rp: row.rpAfter, displaySeason: row.displaySeasonId })
    const tierKey = rankTierToGradeBaselineKey(playerTier)
    if (!tierKey) {
      skipped.missingTier += 1
      continue
    }
    const weaponTypeId = row.bestWeapon ?? null
    const role = weaponTypeId != null && weaponTypeId > 0 ? lookupCharacterWeaponRole(row.characterNum, weaponTypeId) : null
    if (!role || weaponTypeId == null || weaponTypeId <= 0) {
      skipped.missingRole += 1
      continue
    }
    const production = computeLegacyMatchPerformanceGradeForCalibration({ row, playerTier, displaySeasonId: row.displaySeasonId })
    if (production.matchGrade == null || production.matchGradeScore == null) {
      skipped.missingGradeInput += 1
      continue
    }
    if (production.matchGradeRoleScore == null) {
      skipped.missingRoleScore += 1
      continue
    }
    const baseline = resolveResidualRoleBaseline({
      season: row.displaySeasonId,
      mode: row.gameMode,
      tier: tierKey,
      characterNum: row.characterNum,
      weaponTypeId,
      role,
      placement: row.placement,
      durationSeconds: row.gameDuration,
    })
    if (baseline.expectedRolePerformanceScore == null) {
      skipped.missingResidualBaseline += 1
      continue
    }
    evaluated.push({
      internalContestId: row.gameId,
      playedAt: row.playedAt,
      roleResidual: round(production.matchGradeRoleScore - baseline.expectedRolePerformanceScore),
      productionScore: production.matchGradeScore,
      productionGrade: production.matchGrade,
    })
  }

  const split = splitByPlayedAt(evaluated)
  const calibrationResiduals = split.calibration.map((row) => row.roleResidual).sort((a, b) => a - b)
  const productionScores = split.calibration.map((row) => row.productionScore).sort((a, b) => a - b)
  const productionRatios = {
    sFamilyOrAbove: ratio(split.calibration, (row) => gradeRank(row.productionGrade) >= gradeRank('S-')),
    sOrAbove: ratio(split.calibration, (row) => gradeRank(row.productionGrade) >= gradeRank('S')),
    sPlus: ratio(split.calibration, (row) => row.productionGrade === 'S+'),
  }
  const gates = FIXED_GATES

  const document = {
    schemaVersion: 1,
    calibrationVersion: ARTIFACT_VERSION,
    matchGradeVersion: MATCH_GRADE_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      mode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      selectedIdentifiers: [],
    },
    residualBaselineVersion: TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
    split: {
      strategy: 'playedAt ascending: oldest 80% contests calibration, newest 20% contests holdout',
      calibrationRows: split.calibration.length,
      holdoutRows: split.holdout.length,
      calibrationContests: split.contests.calibration,
      holdoutContests: split.contests.holdout,
      leakageContestCount: split.leakageContestCount,
      ...split.range,
    },
    candidate: 'P4',
    placementAdjustment: {
      1: 4,
      2: 3,
      3: 2,
      4: 0.5,
      5: -0.5,
      6: -2,
      7: -3,
      8: -4,
    },
    gates,
    gateResidualCutoffs: {
      sFamily: round(quantile(calibrationResiduals, gates.sFamily)),
      s: round(quantile(calibrationResiduals, gates.s)),
      sPlus: round(quantile(calibrationResiduals, gates.sPlus)),
    },
    targetQuantileCurve: Object.fromEntries(
      TARGET_QUANTILES.map((q) => [`p${String(Math.round(q * 100)).padStart(2, '0')}`, round(quantile(productionScores, q))]),
    ),
    residualCdf: {
      method: 'empirical-midrank',
      sortedResiduals: calibrationResiduals,
    },
    productionTargetDistribution: {
      method: 'linear-quantile-interpolation',
      sortedScores: productionScores,
    },
    validation: {
      sourceRows: rows.length,
      evaluatedRows: evaluated.length,
      skipped,
      productionRatios,
    },
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document)}\n`, 'utf8')
  console.log(JSON.stringify({
    output: outputPath,
    calibrationVersion: ARTIFACT_VERSION,
    matchGradeVersion: MATCH_GRADE_VERSION,
    residualBaselineVersion: TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
    split: document.split,
    gates: document.gates,
    targetQuantileCurve: document.targetQuantileCurve,
    validation: document.validation,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
