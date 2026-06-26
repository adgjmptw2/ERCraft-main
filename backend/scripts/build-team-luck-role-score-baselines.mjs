#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import {
  computeCombatContributionRatio,
  deathsPer10m,
  durationBucket,
  perMinute,
  TEAM_LUCK_ROLE_SCORE_VERSION,
} from '../dist/services/roleScore/teamLuckRoleScore.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'src', 'data', 'roleScore')
const outputPath = join(outputDir, 'team-luck-role-score-baselines.v1.json')

const prisma = new PrismaClient()
const BASELINE_VERSION = 'team-luck-role-score-baselines.v1'
const METRIC_NAMES = [
  'damageToPlayer',
  'damageToPlayerPerMinute',
  'combatContribution',
  'deathsPer10m',
  'visionScore',
  'visionScorePerMinute',
  'monsterKill',
  'monsterKillPerMinute',
]

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function createAccumulator() {
  return {
    count: 0,
    sums: Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])),
    counts: Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])),
  }
}

function addToAccumulator(acc, metrics) {
  acc.count += 1
  for (const name of METRIC_NAMES) {
    const value = metrics[name]
    if (value == null || !Number.isFinite(value)) continue
    acc.sums[name] += value
    acc.counts[name] += 1
  }
}

function meanMetrics(acc) {
  return Object.fromEntries(
    METRIC_NAMES.map((name) => [
      name,
      acc.counts[name] > 0 ? round(acc.sums[name] / acc.counts[name]) : null,
    ]),
  )
}

function serialize(map) {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, acc]) => [key, { count: acc.count, means: meanMetrics(acc) }]),
  )
}

async function main() {
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank', displaySeasonId: CURRENT_DISPLAY_SEASON },
    select: {
      characterNum: true,
      kills: true,
      deaths: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      gameDuration: true,
      bestWeapon: true,
      viewContribution: true,
      monsterKill: true,
    },
  })

  const roleDuration = new Map()
  const roleGlobal = new Map()
  const skipped = { missingWeapon: 0, missingRole: 0, missingDuration: 0 }
  let eligibleRows = 0

  for (const row of rows) {
    const weaponTypeId = row.bestWeapon ?? null
    if (!isFiniteNumber(weaponTypeId) || weaponTypeId <= 0) {
      skipped.missingWeapon += 1
      continue
    }
    const role = lookupCharacterWeaponRole(row.characterNum, weaponTypeId)
    if (!role) {
      skipped.missingRole += 1
      continue
    }
    if (!isFiniteNumber(row.gameDuration) || row.gameDuration <= 0) {
      skipped.missingDuration += 1
      continue
    }

    const metrics = {
      damageToPlayer: row.damageToPlayer ?? null,
      damageToPlayerPerMinute: perMinute(row.damageToPlayer ?? null, row.gameDuration),
      combatContribution: computeCombatContributionRatio({
        playerKill: row.kills ?? null,
        playerAssistant: row.assists ?? null,
        teamKill: row.teamKills ?? null,
      }),
      deathsPer10m: deathsPer10m(row.deaths ?? null, row.gameDuration),
      visionScore: row.viewContribution ?? null,
      visionScorePerMinute: perMinute(row.viewContribution ?? null, row.gameDuration),
      monsterKill: row.monsterKill ?? null,
      monsterKillPerMinute: perMinute(row.monsterKill ?? null, row.gameDuration),
    }

    const duration = durationBucket(row.gameDuration)
    const durationKey = `role:${role}|duration:${duration}`
    const globalKey = `role:${role}`
    const durationAcc = roleDuration.get(durationKey) ?? createAccumulator()
    const globalAcc = roleGlobal.get(globalKey) ?? createAccumulator()
    addToAccumulator(durationAcc, metrics)
    addToAccumulator(globalAcc, metrics)
    roleDuration.set(durationKey, durationAcc)
    roleGlobal.set(globalKey, globalAcc)
    eligibleRows += 1
  }

  const document = {
    schemaVersion: 1,
    baselineVersion: BASELINE_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      table: 'player_matches',
      mode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      selectedIdentifiers: [],
    },
    roleScoreVersion: TEAM_LUCK_ROLE_SCORE_VERSION,
    metricNames: METRIC_NAMES,
    roleDuration: serialize(roleDuration),
    roleGlobal: serialize(roleGlobal),
    validation: {
      sourceRows: rows.length,
      eligibleRows,
      roleDurationKeyCount: roleDuration.size,
      roleGlobalKeyCount: roleGlobal.size,
      skipped,
    },
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    output: outputPath,
    baselineVersion: BASELINE_VERSION,
    roleScoreVersion: TEAM_LUCK_ROLE_SCORE_VERSION,
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
