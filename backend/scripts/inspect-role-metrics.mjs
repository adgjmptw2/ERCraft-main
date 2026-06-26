#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  DEFAULT_FLAT_DEALER,
  DEFAULT_SKILL_DEALER,
  SUPPORT_TARGETS,
  TANK_TARGETS,
  buildFieldInventory,
  buildRedactedSamples,
  buildTextReport,
  loadRoleMapFromJson,
  resolveRoleBucket,
} from '../dist/audit/roleMetricInspect.js'
import { formatComboDisplayName } from '../dist/utils/comboDisplayName.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const tmpDir = join(backendRoot, 'tmp')
const rolesPath = join(backendRoot, 'src/data/characterGrade/character-weapon-roles.v1.json')

const PER_COMBO_MAX = 200
const DEALER_MIN = 100

const prisma = new PrismaClient()

/**
 * @param {{ characterNum: number, weaponTypeId: number, label: string, roleBucket: 'tank' | 'support' | 'flatDealer' | 'skillDealer' }} target
 */
async function countComboSamples(target) {
  return prisma.playerMatch.count({
    where: {
      characterNum: target.characterNum,
      bestWeapon: target.weaponTypeId,
      rawJson: { not: null },
    },
  })
}

/**
 * @param {{ characterNum: number, weaponTypeId: number, label: string, roleBucket: 'tank' | 'support' | 'flatDealer' | 'skillDealer' }} target
 * @param {number} take
 */
async function fetchComboMatches(target, take) {
  const rows = await prisma.playerMatch.findMany({
    where: {
      characterNum: target.characterNum,
      bestWeapon: target.weaponTypeId,
      rawJson: { not: null },
    },
    orderBy: { playedAt: 'desc' },
    take,
    select: {
      characterNum: true,
      bestWeapon: true,
      rawJson: true,
    },
  })

  return rows.map((row) => ({
    characterNum: row.characterNum,
    bestWeapon: row.bestWeapon,
    rawJson: row.rawJson,
    roleBucket: target.roleBucket,
    comboLabel: target.label,
  }))
}

/**
 * @param {'flatDealer' | 'skillDealer'} bucket
 * @param {Map<string, string>} roleMap
 */
async function findDealerSubstitute(bucket, roleMap) {
  const roleNeedle = bucket === 'flatDealer' ? '평타 딜러' : '스증 딜러'
  const grouped = await prisma.playerMatch.groupBy({
    by: ['characterNum', 'bestWeapon'],
    where: {
      rawJson: { not: null },
      bestWeapon: { not: null },
    },
    _count: { _all: true },
    orderBy: { _count: { characterNum: 'desc' } },
    take: 200,
  })

  for (const row of grouped) {
    if (row.bestWeapon == null) continue
    const key = `${row.characterNum}:${row.bestWeapon}`
    const role = roleMap.get(key)
    if (role !== roleNeedle) continue
    if (row._count._all < DEALER_MIN) continue
    return {
    characterNum: row.characterNum,
    weaponTypeId: row.bestWeapon,
    label: `${formatComboDisplayName(row.characterNum, row.bestWeapon)} (${roleNeedle}, DB 대체)`,
    roleBucket: bucket,
  }
  }

  const fallback = bucket === 'flatDealer' ? DEFAULT_FLAT_DEALER : DEFAULT_SKILL_DEALER
  return {
    ...fallback,
    label: formatComboDisplayName(fallback.characterNum, fallback.weaponTypeId),
    roleBucket: bucket,
  }
}

/**
 * @param {Array<{ characterNum: number, weaponTypeId: number, label: string, roleBucket: 'tank' | 'support' }>} targets
 * @param {Map<string, string>} roleMap
 */
async function resolveTargetsWithFallback(targets, roleMap) {
  /** @type {Array<{ characterNum: number, weaponTypeId: number, label: string, roleBucket: 'tank' | 'support' | 'flatDealer' | 'skillDealer' }>} */
  const resolved = []
  /** @type {Array<{ combo: string, reason: string, substitute?: string }>} */
  const excluded = []

  for (const target of targets) {
    const count = await countComboSamples({ ...target, roleBucket: target.roleBucket })
    if (count > 0) {
      resolved.push({ ...target, roleBucket: target.roleBucket })
      continue
    }

    const roleNeedle = target.roleBucket === 'tank' ? '탱커' : '서포터'
    const grouped = await prisma.playerMatch.groupBy({
      by: ['characterNum', 'bestWeapon'],
      where: {
        rawJson: { not: null },
        bestWeapon: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { characterNum: 'desc' } },
      take: 300,
    })

    let substitute = null
    for (const row of grouped) {
      if (row.bestWeapon == null) continue
      const key = `${row.characterNum}:${row.bestWeapon}`
      const role = roleMap.get(key)
      if (role !== roleNeedle) continue
      if (row._count._all <= 0) continue
      substitute = {
        characterNum: row.characterNum,
        weaponTypeId: row.bestWeapon,
        label: `${key} (${roleNeedle}, DB 대체)`,
        roleBucket: target.roleBucket,
      }
      break
    }

    excluded.push({
      combo: `${target.label} (${target.characterNum}:${target.weaponTypeId})`,
      reason: 'rawJson 표본 0건',
      substitute: substitute ? `${substitute.label} (${substitute.characterNum}:${substitute.weaponTypeId})` : undefined,
    })

    if (substitute) resolved.push(substitute)
  }

  return { resolved, excluded }
}

async function main() {
  const rolesJson = JSON.parse(await readFile(rolesPath, 'utf8'))
  const roleMap = loadRoleMapFromJson(rolesJson.entries ?? {})

  const totalWithRawJson = await prisma.playerMatch.count({
    where: { rawJson: { not: null } },
  })

  const tankResolved = await resolveTargetsWithFallback(
    TANK_TARGETS.map((target) => ({
      ...target,
      label: formatComboDisplayName(target.characterNum, target.weaponTypeId),
      roleBucket: 'tank',
    })),
    roleMap,
  )
  const supportResolved = await resolveTargetsWithFallback(
    SUPPORT_TARGETS.map((target) => ({
      ...target,
      label: formatComboDisplayName(target.characterNum, target.weaponTypeId),
      roleBucket: 'support',
    })),
    roleMap,
  )

  const flatDealerTarget = await findDealerSubstitute('flatDealer', roleMap)
  const skillDealerTarget = await findDealerSubstitute('skillDealer', roleMap)

  /** @type {Array<{ characterNum: number, weaponTypeId: number, label: string, roleBucket: 'tank' | 'support' | 'flatDealer' | 'skillDealer' }>} */
  const allTargets = [
    ...tankResolved.resolved,
    ...supportResolved.resolved,
    { ...flatDealerTarget, roleBucket: 'flatDealer' },
    { ...skillDealerTarget, roleBucket: 'skillDealer' },
  ]

  /** @type {Record<string, number>} */
  const sampleCounts = {}
  /** @type {Array<{ rawJson: unknown, characterNum: number, bestWeapon: number | null, roleBucket: import('./roleMetricInspectCore.mjs').RoleBucket, comboLabel?: string }>} */
  const matches = []

  for (const target of allTargets) {
    const available = await countComboSamples(target)
    const take = Math.min(PER_COMBO_MAX, Math.max(available, 0))
    const effectiveTake =
      target.roleBucket === 'flatDealer' || target.roleBucket === 'skillDealer'
        ? Math.min(PER_COMBO_MAX, Math.max(available, 0))
        : Math.min(PER_COMBO_MAX, available)

    const key = `${target.label} (${target.characterNum}:${target.weaponTypeId})`
    sampleCounts[key] = effectiveTake

    if (effectiveTake <= 0) continue

    const rows = await fetchComboMatches(target, effectiveTake)
    for (const row of rows) {
      matches.push({
        ...row,
        roleBucket: target.roleBucket,
        comboLabel: target.label,
      })
    }
  }

  if (totalWithRawJson > 0 && matches.length < totalWithRawJson) {
    const extra = await prisma.playerMatch.findMany({
      where: { rawJson: { not: null } },
      orderBy: { playedAt: 'desc' },
      take: Math.min(500, totalWithRawJson),
      select: {
        characterNum: true,
        bestWeapon: true,
        rawJson: true,
      },
    })

    const seen = new Set(matches.map((row) => JSON.stringify([row.characterNum, row.bestWeapon, row.rawJson])))
    for (const row of extra) {
      const signature = JSON.stringify([row.characterNum, row.bestWeapon, row.rawJson])
      if (seen.has(signature)) continue
      seen.add(signature)
      matches.push({
        characterNum: row.characterNum,
        bestWeapon: row.bestWeapon,
        rawJson: row.rawJson,
        roleBucket: resolveRoleBucket(row.characterNum, row.bestWeapon, roleMap),
      })
    }
  }

  const inventory = buildFieldInventory(matches)
  const inventoryOutput = {
    ...inventory,
    dbStats: {
      totalPlayerMatches: await prisma.playerMatch.count(),
      playerMatchesWithRawJson: totalWithRawJson,
    },
  }

  const report = buildTextReport({
    investigatedMatchCount: matches.length,
    sampleCounts,
    excludedCombos: [...tankResolved.excluded, ...supportResolved.excluded],
    inventory: inventoryOutput,
  })

  const redactedSamples = buildRedactedSamples(matches, 12)

  await mkdir(tmpDir, { recursive: true })

  const inventoryPath = join(tmpDir, 'role-metric-field-inventory.json')
  const reportPath = join(tmpDir, 'role-metric-field-report.txt')
  const samplesPath = join(tmpDir, 'role-metric-samples.redacted.json')

  await writeFile(inventoryPath, `${JSON.stringify(inventoryOutput, null, 2)}\n`, 'utf8')
  await writeFile(reportPath, `${report}\n`, 'utf8')
  await writeFile(
    samplesPath,
    `${JSON.stringify({ generatedAt: inventoryOutput.generatedAt, sampleCount: redactedSamples.length, samples: redactedSamples }, null, 2)}\n`,
    'utf8',
  )

  console.log(`Investigated matches: ${matches.length}`)
  console.log(`PlayerMatch rows with rawJson in DB: ${totalWithRawJson}`)
  console.log(`Wrote ${inventoryPath}`)
  console.log(`Wrote ${reportPath}`)
  console.log(`Wrote ${samplesPath}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
