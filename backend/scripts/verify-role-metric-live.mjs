#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { applyCharacterPerformanceGrades, playerMatchRowToGradeInput } from '../dist/services/characterPerformanceGrade/compute.js'
import { loadRoleMetricBaselineDocument } from '../dist/audit/roleMetricBaselineBuilder.js'
import { hashUid } from '../dist/audit/roleMetricBaselineBuilder.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { aggregateWeaponGroupStats } from '../dist/services/characterPerformanceGrade/metrics.js'
import { resolveLiveRoleMetricAttempt } from '../dist/services/characterPerformanceGrade/roleMetricLiveGrade.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'tmp', 'role-metric-live-verify')

const prisma = new PrismaClient()

const FINE_GRADE_ORDER = [
  'S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-',
]

function coarseGrade(label) {
  if (!label || label === '-') return null
  const first = label.charAt(0)
  return first === 'S' || first === 'A' || first === 'B' || first === 'C' || first === 'D'
    ? first
    : null
}

function gradeStepDelta(before, after) {
  const beforeIndex = FINE_GRADE_ORDER.indexOf(before ?? '')
  const afterIndex = FINE_GRADE_ORDER.indexOf(after ?? '')
  if (beforeIndex < 0 || afterIndex < 0) return null
  return Math.abs(afterIndex - beforeIndex)
}

function summarizeBaselineEligibility(document) {
  const eligibleCombos = []
  for (const [key, combo] of Object.entries(document.combinations)) {
    const flags = combo.liveEligibility
    if (
      flags.tankingEfficiency ||
      flags.shieldDamageOffsetFromPlayer ||
      flags.teamRecover ||
      flags.ccTimeToPlayer
    ) {
      eligibleCombos.push({
        key,
        label: combo.label,
        role: combo.role,
        tankingEfficiency: flags.tankingEfficiency,
        shieldDamageOffsetFromPlayer: flags.shieldDamageOffsetFromPlayer,
        teamRecover: flags.teamRecover,
        ccTimeToPlayer: flags.ccTimeToPlayer,
      })
    }
  }
  return eligibleCombos
}

async function main() {
  const document = loadRoleMetricBaselineDocument()
  const baselineEligible = summarizeBaselineEligibility(document)

  const rows = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    select: {
      uid: true,
      characterNum: true,
      bestWeapon: true,
      rpAfter: true,
      displaySeasonId: true,
      roleMetricsVersion: true,
      viewContribution: true,
      monsterKill: true,
      damageFromPlayer: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      ccTimeToPlayer: true,
      placement: true,
      kills: true,
      assists: true,
      deaths: true,
      teamKills: true,
      damageToPlayer: true,
      victory: true,
      rawJson: true,
    },
  })

  const profileMap = new Map()
  for (const row of rows) {
    const bucket = profileMap.get(row.uid) ?? []
    bucket.push(row)
    profileMap.set(row.uid, bucket)
  }

  const weaponGroupAttempts = []
  const fallbackReasonCounts = {}
  const modeCounts = {}
  const liveApplied = []
  const spotlightLabels = new Set([
    '미르카 망치',
    '가넷 방망이',
    '일레븐 망치',
    '프리야 기타',
    '아르다 아르카나',
    '샬럿 아르카나',
    '레니 권총',
  ])
  const spotlightResults = []

  for (const [uid, profileRows] of profileMap) {
    const playerTier = getRankTierFromRp(profileRows[0]?.rpAfter ?? null, null, CURRENT_DISPLAY_SEASON)
    const playerTierKey = rankTierToGradeBaselineKey(playerTier) ?? 'meteorite_plus'

    const weaponGroups = new Map()
    for (const row of profileRows) {
      const key = `${row.characterNum}:${row.bestWeapon}`
      const bucket = weaponGroups.get(key) ?? []
      bucket.push(row)
      weaponGroups.set(key, bucket)
    }

    for (const groupRows of weaponGroups.values()) {
      const sample = groupRows[0]
      const role = lookupCharacterWeaponRole(sample.characterNum, sample.bestWeapon)
      if (role !== '탱커' && role !== '서포터') continue

      const matches = groupRows
        .map((row) => playerMatchRowToGradeInput(row))
        .filter((row) => row != null)
      const stats = aggregateWeaponGroupStats(sample.characterNum, sample.bestWeapon, matches)
      if (!stats) continue

      const attempt = resolveLiveRoleMetricAttempt(
        role,
        playerTierKey,
        stats,
        matches,
        CURRENT_DISPLAY_SEASON,
      )
      const comboKey = `${playerTierKey}|${sample.characterNum}:${sample.bestWeapon}`
      const baselineCombo = document.combinations[comboKey]

      weaponGroupAttempts.push({
        profileId: hashUid(uid),
        comboKey,
        label: baselineCombo?.label ?? `${sample.characterNum}:${sample.bestWeapon}`,
        role,
        mode: attempt.context.mode,
        fallbackReason: attempt.context.fallbackReason,
        coverage: attempt.context.coverage,
        baselineReadiness: attempt.context.baselineReadiness,
        games: groupRows.length,
      })

      modeCounts[attempt.context.mode] = (modeCounts[attempt.context.mode] ?? 0) + 1
      const reason = attempt.context.fallbackReason ?? 'applied'
      fallbackReasonCounts[reason] = (fallbackReasonCounts[reason] ?? 0) + 1

      if (['tank-t1', 'tank-t2', 'support-healer-s1'].includes(attempt.context.mode)) {
        liveApplied.push(weaponGroupAttempts[weaponGroupAttempts.length - 1])
      }

      const label = baselineCombo?.label
      if (label && spotlightLabels.has(label)) {
        spotlightResults.push({
          profileId: hashUid(uid),
          label,
          comboKey,
          role,
          mode: attempt.context.mode,
          fallbackReason: attempt.context.fallbackReason,
          coverage: attempt.context.coverage,
          games: groupRows.length,
        })
      }
    }

    const characterMap = new Map()
    for (const row of profileRows) {
      const stat = characterMap.get(row.characterNum) ?? {
        characterNum: row.characterNum,
        games: 0,
        wins: 0,
        winRate: 0,
        avgRank: 0,
        kills: 0,
        assists: 0,
        deaths: 0,
        kda: 0,
        avgTeamKills: 0,
        avgKills: 0,
        avgDamage: 0,
        gradeLabel: null,
      }
      stat.games += 1
      if (row.victory) stat.wins += 1
      characterMap.set(row.characterNum, stat)
    }
    for (const stat of characterMap.values()) {
      stat.winRate = stat.games > 0 ? (stat.wins / stat.games) * 100 : 0
    }

    applyCharacterPerformanceGrades({
      rows: profileRows,
      characterStats: [...characterMap.values()],
      metaStatus: 'complete',
      playerTier,
    })
  }

  const scoreDeltas = []
  let oneStepChanges = 0
  let twoPlusStepChanges = 0
  let coarseChanges = 0

  for (const [uid, profileRows] of profileMap) {
    const characterMap = new Map()
    for (const row of profileRows) {
      const stat = characterMap.get(row.characterNum) ?? {
        characterNum: row.characterNum,
        games: 0,
        wins: 0,
        winRate: 0,
        avgRank: 0,
        kills: 0,
        assists: 0,
        deaths: 0,
        kda: 0,
        avgTeamKills: 0,
        avgKills: 0,
        avgDamage: 0,
        gradeLabel: null,
      }
      stat.games += 1
      if (row.victory) stat.wins += 1
      characterMap.set(row.characterNum, stat)
    }
    for (const stat of characterMap.values()) {
      stat.winRate = stat.games > 0 ? (stat.wins / stat.games) * 100 : 0
    }

    const playerTier = getRankTierFromRp(profileRows[0]?.rpAfter ?? null, null, CURRENT_DISPLAY_SEASON)
    const graded = applyCharacterPerformanceGrades({
      rows: profileRows,
      characterStats: [...characterMap.values()],
      metaStatus: 'complete',
      playerTier,
    })

    for (const stat of graded) {
      if (!stat.gradeRoleMetricMode || stat.gradeRoleMetricMode === 'legacy') continue
      scoreDeltas.push({
        profileId: hashUid(uid),
        characterNum: stat.characterNum,
        mode: stat.gradeRoleMetricMode,
        grade: stat.grade,
        score: stat.gradeScore,
        coverage: stat.gradeRoleMetricCoverage,
      })
    }
  }

  const rawJsonNonNull = rows.filter((row) => row.rawJson != null).length
  const roleMetricsV1 = rows.filter((row) => row.roleMetricsVersion === 1).length

  const summary = {
    generatedAt: new Date().toISOString(),
    seasonId: CURRENT_DISPLAY_SEASON,
    baselineVersion: document.version,
    baselineEligibleCount: baselineEligible.length,
    baselineEligible,
    weaponGroupAttempts: weaponGroupAttempts.length,
    modeCounts,
    fallbackReasonCounts,
    liveAppliedCount: liveApplied.length,
    liveApplied: liveApplied.slice(0, 100),
    spotlightResults,
    scoreDeltas,
    gradeChange: {
      oneStepChanges,
      twoPlusStepChanges,
      coarseChanges,
    },
    dataIntegrity: {
      totalRows: rows.length,
      roleMetricsVersion1Rows: roleMetricsV1,
      rawJsonNonNullRows: rawJsonNonNull,
    },
  }

  await mkdir(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'live-mode-summary.json')
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`)

  console.log(
    JSON.stringify(
      {
        outputPath,
        baselineEligibleCount: baselineEligible.length,
        weaponGroupAttempts: weaponGroupAttempts.length,
        liveApplied: liveApplied.length,
        modeCounts,
        fallbackReasonCounts,
        roleMetricsVersion1Rows: roleMetricsV1,
        rawJsonNonNullRows: rawJsonNonNull,
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
