import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import baselineDoc from '../src/data/characterGrade/tier-baselines.v1.json' with { type: 'json' }
import rolesDoc from '../src/data/characterGrade/character-weapon-roles.v1.json' with { type: 'json' }
import { normalizeRankTier } from '../dist/utils/rankTier.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(moduleDir, '..')
const outputDir = join(repoRoot, 'src', 'data', 'roleScore')
const CURRENT_DISPLAY_SEASON = 11

const ROLE_SCORE_VERSION = 'role-score.v3'
const FALLBACK_VERSION = 'role-score-fallback-baselines.v1'
const DURATION_VERSION = 'role-score-duration-adjustments.v1'
const PLACEMENT_VERSION = 'team-flow-role-placement-effects.v1'
const MIN_GROUP_SAMPLE = 30
const MULTIPLIER_MIN = 0.45
const MULTIPLIER_MAX = 1.8

const roles = rolesDoc.entries
const combinations = baselineDoc.combinations
const prisma = new PrismaClient()

const ROLE_WEIGHTS = {
  '평타 딜러': { damage: 32, combatContribution: 24, survival: 10, vision: 18, monster: 16 },
  '스증 딜러': { damage: 36, combatContribution: 25, survival: 10, vision: 18, monster: 11 },
  암살자: { damage: 30, combatContribution: 32, survival: 10, vision: 18, monster: 10 },
  '평타 브루저': { damage: 27, combatContribution: 28, survival: 15, vision: 17, monster: 13 },
  '스증 브루저': { damage: 30, combatContribution: 29, survival: 15, vision: 17, monster: 9 },
  탱커: { damage: 12, combatContribution: 35, survival: 20, vision: 30, monster: 3 },
  서포터: { damage: 7, combatContribution: 38, survival: 20, vision: 33, monster: 2 },
}

function round(value, digits = 6) {
  return Math.round(value * 10 ** digits) / 10 ** digits
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function isFinitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function roleFor(characterNum, weaponTypeId) {
  return roles[`${characterNum}:${weaponTypeId}`]?.role ?? null
}

function parseComboKey(key) {
  const [tierKey, characterNum, weaponTypeId] = key.split(':')
  return { tierKey, characterNum: Number(characterNum), weaponTypeId: Number(weaponTypeId) }
}

function createAccumulator() {
  return { count: 0, weightedCount: 0, sums: {} }
}

function addBaseline(acc, metrics) {
  const weight = metrics.count
  acc.count += weight
  acc.weightedCount += weight
  for (const metric of [
    'winRate',
    'top3Rate',
    'averagePlace',
    'averagePlayerKill',
    'averagePlayerAssistant',
    'averageTeamKill',
    'averageDeaths',
    'averageDamageToPlayer',
    'averageViewContribution',
    'averageMonsterKill',
  ]) {
    acc.sums[metric] = (acc.sums[metric] ?? 0) + metrics[metric] * weight
  }
}

function finalizeBaseline(acc) {
  if (acc.weightedCount <= 0) return null
  const means = { count: acc.count }
  for (const [metric, sum] of Object.entries(acc.sums)) {
    means[metric] = round(sum / acc.weightedCount)
  }
  means.count = acc.count
  return { count: acc.count, means }
}

function durationBucket(seconds) {
  if (!isFinitePositive(seconds)) return 'unknown-duration'
  const minutes = seconds / 60
  if (minutes < 15) return 'duration-lt-15m'
  if (minutes < 20) return 'duration-15-20m'
  if (minutes < 25) return 'duration-20-25m'
  if (minutes < 30) return 'duration-25-30m'
  return 'duration-30m-plus'
}

function comboKey(tierKey, characterNum, weaponTypeId) {
  return `${tierKey}:${characterNum}:${weaponTypeId}`
}

function combatContribution(kills, assists, teamKills) {
  if (!Number.isFinite(kills) || !Number.isFinite(assists) || !Number.isFinite(teamKills) || teamKills <= 0) {
    return null
  }
  return Math.min((kills + assists * 0.7) / teamKills, 1)
}

function metricScore(actual, expected, higherBetter) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(expected) < 1e-6) return null
  const relative = higherBetter ? (actual - expected) / Math.abs(expected) : (expected - actual) / Math.abs(expected)
  return round(clamp(65 + 45 * relative, 20, 100), 4)
}

function weightedScore(entries) {
  let weighted = 0
  let total = 0
  for (const entry of entries) {
    if (entry.score == null || !Number.isFinite(entry.score) || entry.weight <= 0) continue
    weighted += entry.score * entry.weight
    total += entry.weight
  }
  return total > 0 ? round(weighted / total, 4) : null
}

function buildFallbackBaselines() {
  const tierCharacter = new Map()
  const tierRole = new Map()
  const tierOverall = new Map()
  let skippedMissingRole = 0

  for (const [key, metrics] of Object.entries(combinations)) {
    const parsed = parseComboKey(key)
    const role = roleFor(parsed.characterNum, parsed.weaponTypeId)
    if (!role) {
      skippedMissingRole += 1
      continue
    }
    for (const [map, groupKey] of [
      [tierCharacter, `${parsed.tierKey}:${parsed.characterNum}`],
      [tierRole, `${parsed.tierKey}:${role}`],
      [tierOverall, parsed.tierKey],
    ]) {
      const acc = map.get(groupKey) ?? createAccumulator()
      addBaseline(acc, metrics)
      map.set(groupKey, acc)
    }
  }

  return {
    schemaVersion: 1,
    baselineVersion: FALLBACK_VERSION,
    roleScoreVersion: ROLE_SCORE_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      artifact: 'tier-baselines.v1.json',
      sourceArchive: baselineDoc.sourceArchive,
      collectedAt: baselineDoc.collectedAt,
      periodDays: baselineDoc.periodDays,
      combinationCount: baselineDoc.combinationCount,
    },
    config: {
      fallbackOrder: ['exact', 'tier-character', 'tier-role', 'tier-overall'],
      minGroupSample: MIN_GROUP_SAMPLE,
      note: 'Exact baselines stay in tier-baselines.v1.json. This artifact stores DAK.GG-derived fallback aggregates only.',
    },
    tierCharacter: Object.fromEntries([...tierCharacter.entries()].map(([key, acc]) => [key, finalizeBaseline(acc)])),
    tierRole: Object.fromEntries([...tierRole.entries()].map(([key, acc]) => [key, finalizeBaseline(acc)])),
    tierOverall: Object.fromEntries([...tierOverall.entries()].map(([key, acc]) => [key, finalizeBaseline(acc)])),
    metadata: {
      tierCharacterGroups: tierCharacter.size,
      tierRoleGroups: tierRole.size,
      tierOverallGroups: tierOverall.size,
      skippedMissingRole,
    },
  }
}

function exactBaseline(tierKey, characterNum, weaponTypeId) {
  return combinations[comboKey(tierKey, characterNum, weaponTypeId)] ?? null
}

function createRatioAccumulator() {
  return {
    sampleCount: 0,
    sums: {
      damageToPlayer: 0,
      viewContribution: 0,
      monsterKill: 0,
      deaths: 0,
    },
    counts: {
      damageToPlayer: 0,
      viewContribution: 0,
      monsterKill: 0,
      deaths: 0,
    },
  }
}

function addRatio(acc, metric, actual, baseline) {
  if (!isFinitePositive(actual) || !isFinitePositive(baseline)) return
  acc.sums[metric] += clamp(actual / baseline, 0.35, 1.8)
  acc.counts[metric] += 1
}

function finalizeRatio(acc, fallback = null) {
  const multipliers = {}
  for (const metric of Object.keys(acc.sums)) {
    const count = acc.counts[metric]
    const raw = count >= MIN_GROUP_SAMPLE ? acc.sums[metric] / count : fallback?.multipliers?.[metric] ?? 1
    multipliers[metric] = round(clamp(raw, MULTIPLIER_MIN, MULTIPLIER_MAX), 4)
  }
  return { sampleCount: acc.sampleCount, multipliers }
}

async function loadRows() {
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank', displaySeasonId: CURRENT_DISPLAY_SEASON },
    select: {
      gameId: true,
      displaySeasonId: true,
      characterNum: true,
      placement: true,
      kills: true,
      deaths: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      rpAfter: true,
      gameDuration: true,
      bestWeapon: true,
      viewContribution: true,
      monsterKill: true,
    },
  })
  const seen = new Set()
  return rows.filter((row) => {
    const key = [
      row.gameId,
      row.characterNum,
      row.bestWeapon,
      row.placement,
      row.kills,
      row.deaths,
      row.assists,
      row.teamKills,
      row.damageToPlayer,
      row.rpAfter,
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function loadParticipantRows() {
  const rows = await prisma.matchParticipant.findMany({
    where: {
      match: {
        gameMode: 'rank',
        displaySeasonId: CURRENT_DISPLAY_SEASON,
      },
    },
    select: {
      gameId: true,
      teamNumber: true,
      placement: true,
      characterNum: true,
      kills: true,
      deaths: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      rpAfter: true,
      bestWeapon: true,
      match: {
        select: {
          displaySeasonId: true,
          durationSeconds: true,
        },
      },
    },
  })
  return rows.map((row) => ({
    gameId: row.gameId,
    teamNumber: row.teamNumber,
    displaySeasonId: row.match.displaySeasonId ?? CURRENT_DISPLAY_SEASON,
    characterNum: row.characterNum,
    placement: row.placement,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    teamKills: row.teamKills,
    damageToPlayer: row.damageToPlayer,
    rpAfter: row.rpAfter,
    gameDuration: row.match.durationSeconds,
    bestWeapon: row.bestWeapon,
    viewContribution: null,
    monsterKill: null,
  }))
}

function tierKeyFromRp(row) {
  if (!isFinitePositive(row.rpAfter)) return null
  return rankTierToGradeBaselineKey(normalizeRankTier({ rp: row.rpAfter, displaySeason: row.displaySeasonId }))
}

function buildDurationAdjustments(rows) {
  const globalAcc = createRatioAccumulator()
  const roleGlobalAccs = new Map()
  const roleDurationAccs = new Map()
  let eligibleRows = 0

  for (const row of rows) {
    const tierKey = tierKeyFromRp(row)
    const weaponTypeId = row.bestWeapon
    if (!tierKey || !weaponTypeId) continue
    const role = roleFor(row.characterNum, weaponTypeId)
    const baseline = exactBaseline(tierKey, row.characterNum, weaponTypeId)
    if (!role || !baseline) continue
    eligibleRows += 1
    const bucket = durationBucket(row.gameDuration)
    const keys = [
      ['global', globalAcc],
      [`role:${role}`, roleGlobalAccs.get(`role:${role}`) ?? createRatioAccumulator()],
      [`role:${role}|duration:${bucket}`, roleDurationAccs.get(`role:${role}|duration:${bucket}`) ?? createRatioAccumulator()],
    ]
    for (const [, acc] of keys) {
      acc.sampleCount += 1
      addRatio(acc, 'damageToPlayer', row.damageToPlayer, baseline.averageDamageToPlayer)
      addRatio(acc, 'viewContribution', row.viewContribution, baseline.averageViewContribution)
      addRatio(acc, 'monsterKill', row.monsterKill, baseline.averageMonsterKill)
      addRatio(acc, 'deaths', row.deaths, baseline.averageDeaths)
    }
    roleGlobalAccs.set(`role:${role}`, keys[1][1])
    roleDurationAccs.set(`role:${role}|duration:${bucket}`, keys[2][1])
  }

  const global = finalizeRatio(globalAcc)
  const roleGlobal = Object.fromEntries(
    [...roleGlobalAccs.entries()].map(([key, acc]) => [key, finalizeRatio(acc, global)]),
  )
  const roleDuration = Object.fromEntries(
    [...roleDurationAccs.entries()].map(([key, acc]) => {
      const roleKey = key.split('|')[0]
      return [key, finalizeRatio(acc, roleGlobal[roleKey] ?? global)]
    }),
  )

  return {
    schemaVersion: 1,
    adjustmentVersion: DURATION_VERSION,
    roleScoreVersion: ROLE_SCORE_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      rankRows: rows.length,
      eligibleRows,
    },
    config: {
      groups: ['role', 'durationBucket'],
      metrics: ['damageToPlayer', 'viewContribution', 'monsterKill', 'deaths'],
      clamp: { min: MULTIPLIER_MIN, max: MULTIPLIER_MAX },
      minGroupSample: MIN_GROUP_SAMPLE,
      excludesPlacement: true,
    },
    global,
    roleGlobal,
    roleDuration,
    metadata: {
      roleGlobalGroups: Object.keys(roleGlobal).length,
      roleDurationGroups: Object.keys(roleDuration).length,
    },
  }
}

function fallbackBaselineFor(row, fallbackDoc) {
  const tierKey = tierKeyFromRp(row)
  const role = row.bestWeapon ? roleFor(row.characterNum, row.bestWeapon) : null
  if (!tierKey || !role) return null
  const exact = row.bestWeapon ? exactBaseline(tierKey, row.characterNum, row.bestWeapon) : null
  if (exact) return { tierKey, role, metrics: exact, level: 'exact' }
  const tierCharacter = fallbackDoc.tierCharacter[`${tierKey}:${row.characterNum}`]
  if (tierCharacter) return { tierKey, role, metrics: tierCharacter.means, level: 'tier-character' }
  const tierRole = fallbackDoc.tierRole[`${tierKey}:${role}`]
  if (tierRole) return { tierKey, role, metrics: tierRole.means, level: 'tier-role' }
  const tierOverall = fallbackDoc.tierOverall[tierKey]
  if (tierOverall) return { tierKey, role, metrics: tierOverall.means, level: 'tier-overall' }
  return null
}

function durationRecordFor(role, seconds, durationDoc) {
  const bucket = durationBucket(seconds)
  return (
    durationDoc.roleDuration[`role:${role}|duration:${bucket}`] ??
    durationDoc.roleGlobal[`role:${role}`] ??
    durationDoc.global
  )
}

function durationWithinBucketScalar(seconds, bucket) {
  if (!isFinitePositive(seconds)) return 1
  const midpointByBucket = {
    'duration-lt-15m': 750,
    'duration-15-20m': 1050,
    'duration-20-25m': 1350,
    'duration-25-30m': 1650,
    'duration-30m-plus': 1950,
  }
  const midpoint = midpointByBucket[bucket]
  return midpoint ? clamp(seconds / midpoint, 0.75, 1.25) : 1
}

function applyMultiplier(value, metric, durationRecord, row) {
  return value * (durationRecord.multipliers[metric] ?? 1) * durationWithinBucketScalar(row.gameDuration, durationBucket(row.gameDuration))
}

function roleScoreV3ForRow(row, fallbackDoc, durationDoc) {
  const resolved = fallbackBaselineFor(row, fallbackDoc)
  if (!resolved) return null
  const durationRecord = durationRecordFor(resolved.role, row.gameDuration, durationDoc)
  const baseline = resolved.metrics
  const expected = {
    damage: applyMultiplier(baseline.averageDamageToPlayer, 'damageToPlayer', durationRecord, row),
    combatContribution: combatContribution(
      baseline.averagePlayerKill,
      baseline.averagePlayerAssistant,
      baseline.averageTeamKill,
    ),
    survival: applyMultiplier(baseline.averageDeaths, 'deaths', durationRecord, row),
    vision: applyMultiplier(baseline.averageViewContribution, 'viewContribution', durationRecord, row),
    monster: applyMultiplier(baseline.averageMonsterKill, 'monsterKill', durationRecord, row),
  }
  const actual = {
    damage: row.damageToPlayer,
    combatContribution: combatContribution(row.kills, row.assists, row.teamKills),
    survival: row.deaths,
    vision: row.viewContribution,
    monster: row.monsterKill,
  }
  const weights = ROLE_WEIGHTS[resolved.role]
  const score = weightedScore(
    Object.keys(weights).map((metric) => ({
      score: metricScore(actual[metric], expected[metric], metric !== 'survival'),
      weight: weights[metric],
    })),
  )
  return score == null ? null : { score, role: resolved.role }
}

function quantile(sorted, p) {
  if (sorted.length === 0) return null
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return sorted[low]
  return sorted[low] * (1 - (index - low)) + sorted[high] * (index - low)
}

function buildPlacementEffects(rows, participantRows, fallbackDoc, durationDoc) {
  const roleAll = new Map()
  const rolePlacement = new Map()
  const scoredRows = []
  for (const row of rows) {
    const scored = roleScoreV3ForRow(row, fallbackDoc, durationDoc)
    if (!scored || !Number.isFinite(row.placement)) continue
    scoredRows.push({ ...scored, placement: row.placement })
    for (const [map, key] of [
      [roleAll, `role:${scored.role}`],
      [rolePlacement, `role:${scored.role}|placement:${row.placement}`],
    ]) {
      const acc = map.get(key) ?? { sampleCount: 0, sum: 0 }
      acc.sampleCount += 1
      acc.sum += scored.score
      map.set(key, acc)
    }
  }
  const globalMean = scoredRows.reduce((sum, row) => sum + row.score, 0) / Math.max(scoredRows.length, 1)
  const roleGlobal = Object.fromEntries(
    [...roleAll.entries()].map(([key, acc]) => [
      key,
      { sampleCount: acc.sampleCount, meanRoleScore: round(acc.sum / acc.sampleCount, 4) },
    ]),
  )
  const rolePlacementOut = Object.fromEntries(
    [...rolePlacement.entries()].map(([key, acc]) => {
      const roleKey = key.split('|')[0]
      const mean = acc.sum / acc.sampleCount
      const roleMean = roleGlobal[roleKey]?.meanRoleScore ?? globalMean
      return [
        key,
        {
          sampleCount: acc.sampleCount,
          meanRoleScore: round(mean, 4),
          effect: round(mean - roleMean, 4),
        },
      ]
    }),
  )
  const adjusted = scoredRows
    .map((row) => {
      const effect = rolePlacementOut[`role:${row.role}|placement:${row.placement}`]?.effect ?? 0
      return row.score - effect
    })
    .sort((a, b) => a - b)
  const center = round(adjusted.reduce((sum, value) => sum + value, 0) / Math.max(adjusted.length, 1), 4)
  const flowValues = []
  const byGame = new Map()
  for (const row of participantRows) {
    const scored = roleScoreV3ForRow(row, fallbackDoc, durationDoc)
    if (!scored || !Number.isFinite(row.placement) || row.teamNumber == null) continue
    const effect = rolePlacementOut[`role:${scored.role}|placement:${row.placement}`]?.effect ?? 0
    const key = `${row.gameId}:${row.teamNumber}`
    const list = byGame.get(key) ?? []
    list.push({
      role: scored.role,
      placement: row.placement,
      adjustedContribution: scored.score - effect,
    })
    byGame.set(key, list)
  }
  for (const team of byGame.values()) {
    if (team.length < 2) continue
    const values = team.map((row) => row.adjustedContribution)
    for (let i = 0; i < values.length; i += 1) {
      const teammates = values.filter((_, index) => index !== i)
      if (teammates.length === 0) continue
      flowValues.push(teammates.reduce((sum, value) => sum + value, 0) / teammates.length - center)
    }
  }
  flowValues.sort((a, b) => a - b)

  return {
    schemaVersion: 1,
    effectVersion: PLACEMENT_VERSION,
    roleScoreVersion: ROLE_SCORE_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      rankRows: rows.length,
      participantRows: participantRows.length,
      scoredRows: scoredRows.length,
    },
    config: {
      groups: ['role', 'placement'],
      centerMeaning: 'mean adjusted roleScoreV3 after removing role placement effect',
    },
    center,
    weatherThresholds: {
      p10: round(quantile(flowValues, 0.1) ?? -10, 4),
      p30: round(quantile(flowValues, 0.3) ?? -3, 4),
      p70: round(quantile(flowValues, 0.7) ?? 3, 4),
      p90: round(quantile(flowValues, 0.9) ?? 10, 4),
    },
    global: { sampleCount: scoredRows.length, meanRoleScore: round(globalMean, 4) },
    roleGlobal,
    rolePlacement: rolePlacementOut,
    metadata: {
      roleGroups: Object.keys(roleGlobal).length,
      rolePlacementGroups: Object.keys(rolePlacementOut).length,
      teamFlowCalibrationRows: flowValues.length,
    },
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const rows = await loadRows()
  const participantRows = await loadParticipantRows()
  const fallbackDoc = buildFallbackBaselines()
  const durationDoc = buildDurationAdjustments(rows)
  const placementDoc = buildPlacementEffects(rows, participantRows, fallbackDoc, durationDoc)

  const outputs = [
    ['role-score-fallback-baselines.v1.json', fallbackDoc],
    ['role-score-duration-adjustments.v1.json', durationDoc],
    ['team-flow-role-placement-effects.v1.json', placementDoc],
  ]
  for (const [fileName, doc] of outputs) {
    await writeFile(join(outputDir, fileName), `${JSON.stringify(doc)}\n`)
  }
  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        participantRows: participantRows.length,
        fallback: fallbackDoc.metadata,
        duration: durationDoc.metadata,
        placement: placementDoc.metadata,
        weatherThresholds: placementDoc.weatherThresholds,
        center: placementDoc.center,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
