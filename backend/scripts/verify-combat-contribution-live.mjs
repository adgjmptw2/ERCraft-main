#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  applyCharacterPerformanceGrades,
  computeWeaponGroupScore,
  playerMatchRowToGradeInput,
} from '../dist/services/characterPerformanceGrade/compute.js'
import { analyzeTeamKillConsistencyByTeam } from '../dist/audit/combatParticipationShadow.js'
import {
  buildAllComparisonRows,
  groupRowsByExactKey,
  hashProfileId,
} from '../dist/audit/gradeRolloutAudit.js'
import { loadCombatParticipationBaselineDocument } from '../dist/audit/combatParticipationBaselineBuilder.js'
import { buildComboKey } from '../dist/audit/combatParticipationBaselineBuilder.js'
import { hashUid } from '../dist/audit/combatParticipationBaselineBuilder.js'
import {
  loadCombatContributionLiveBlocklist,
  primeCombatContributionLiveCaches,
  resetCombatContributionLiveCaches,
  resolveCombatContributionAttempt,
} from '../dist/services/characterPerformanceGrade/combatContributionLiveGrade.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { aggregateWeaponGroupStats } from '../dist/services/characterPerformanceGrade/metrics.js'
import { resolveLiveRoleMetricAttempt } from '../dist/services/characterPerformanceGrade/roleMetricLiveGrade.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { applySampleConfidence, scoreToFineGrade } from '../dist/services/characterPerformanceGrade/config.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'
import { isParticipationShadowReady } from '../dist/audit/combatParticipationBaselineBuilder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'tmp', 'combat-contribution-live-verify')
const blocklistPath = join(
  backendRoot,
  'src',
  'data',
  'characterGrade',
  'combat-contribution-live-blocklist.v1.json',
)

const prisma = new PrismaClient()

const FINE_GRADE_ORDER = [
  'S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-',
]

const SPOTLIGHT_LABELS = new Set([
  '아야 돌격 소총',
  '쇼이치 단검',
  '재키 도끼',
  '피올로 쌍절곤',
  '미르카 망치',
  '레니 권총',
  '프리야 기타',
  '샬럿 아르카나',
])

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

function summarizeEligibleExactKeys(document) {
  return Object.entries(document.combinations)
    .filter(([, combo]) =>
      isParticipationShadowReady(combo.metrics['participationAssistWeighted_0.7'].readiness),
    )
    .map(([key, combo]) => ({
      key,
      label: combo.label,
      role: combo.role,
      readiness: combo.metrics['participationAssistWeighted_0.7'].readiness,
    }))
}

async function main() {
  resetCombatContributionLiveCaches()
  const participationDocument = loadCombatParticipationBaselineDocument()
  const eligibleExactKeys = summarizeEligibleExactKeys(participationDocument)

  const rows = await prisma.playerMatch.findMany({
    where: {
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    select: {
      uid: true,
      gameId: true,
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
      playedAt: true,
      rawJson: true,
    },
  })

  const participants = await prisma.matchParticipant.findMany({
    where: {
      gameId: { in: [...new Set(rows.map((row) => row.gameId))].slice(0, 5000) },
    },
    select: {
      gameId: true,
      teamNumber: true,
      teamKills: true,
    },
    take: 50000,
  })

  const teamKillCheck = analyzeTeamKillConsistencyByTeam(
    participants.map((row) => ({
      gameId: row.gameId,
      teamNumber: row.teamNumber,
      teamKill: row.teamKills,
    })),
  )

  const profileMap = new Map()
  for (const row of rows) {
    const bucket = profileMap.get(row.uid) ?? []
    bucket.push(row)
    profileMap.set(row.uid, bucket)
  }

  const weaponGroupAttempts = []
  const combatModeCounts = {}
  const combatFallbackCounts = {}
  const liveApplied = []
  const spotlightResults = []

  for (const [uid, profileRows] of profileMap) {
    const latestRow = profileRows.reduce((latest, row) =>
      !latest || row.playedAt > latest.playedAt ? row : latest,
    )
    const playerTier = getRankTierFromRp(latestRow?.rpAfter ?? 0, null, CURRENT_DISPLAY_SEASON)
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
      if (!role) continue

      const matches = groupRows.map((row) => playerMatchRowToGradeInput(row)).filter((row) => row != null)
      const stats = aggregateWeaponGroupStats(sample.characterNum, sample.bestWeapon, matches)
      if (!stats) continue

      const comboKey = buildComboKey(playerTierKey, sample.characterNum, sample.bestWeapon)
      const baselineCombo = participationDocument.combinations[comboKey]
      const hAttempt = resolveLiveRoleMetricAttempt(
        role,
        playerTierKey,
        stats,
        matches,
        CURRENT_DISPLAY_SEASON,
      )
      const combatAttempt = resolveCombatContributionAttempt({
        role,
        playerTierKey,
        stats,
        matches,
        displaySeasonId: CURRENT_DISPLAY_SEASON,
      })

      const scored = computeWeaponGroupScore(stats, role, playerTierKey, matches, CURRENT_DISPLAY_SEASON)
      const entry = {
        profileId: hashUid(uid),
        comboKey,
        label: baselineCombo?.label ?? `${sample.characterNum}:${sample.bestWeapon}`,
        role,
        roleMetricMode: hAttempt.context.mode,
        combatMode: scored.combatMode ?? combatAttempt.mode,
        combatFallbackReason: scored.combatFallbackReason ?? combatAttempt.fallbackReason,
        combatCoverage: scored.combatCoverage ?? combatAttempt.coverage,
        games: groupRows.length,
        gradeScore: scored.rawScore,
        grade: scoreToFineGrade(applySampleConfidence(scored.rawScore, stats.matchCount)),
      }

      weaponGroupAttempts.push(entry)
      combatModeCounts[entry.combatMode] = (combatModeCounts[entry.combatMode] ?? 0) + 1
      const fallbackKey = entry.combatFallbackReason ?? 'applied'
      combatFallbackCounts[fallbackKey] = (combatFallbackCounts[fallbackKey] ?? 0) + 1

      if (entry.combatMode !== 'legacy-k-a-tk') {
        liveApplied.push(entry)
      }

      if (baselineCombo?.label && SPOTLIGHT_LABELS.has(baselineCombo.label)) {
        spotlightResults.push(entry)
      }
    }
  }

  const comparisonRows = buildAllComparisonRows(rows)
  const exactKeySummary = groupRowsByExactKey(comparisonRows)
  const blockedExactKeys = []
  const blockReasons = {}
  const blockEntries = []
  for (const [comboKey, summary] of Object.entries(exactKeySummary)) {
    if (summary.blocklistPass) continue
    blockedExactKeys.push(comboKey)
    blockReasons[comboKey] = summary.blocklistReasons.join(',')
    blockEntries.push({
      key: comboKey,
      reasons: summary.blocklistReasons,
      auditGeneratedAt: summary.generatedAt,
      auditGroupCount: summary.groupCount,
    })
  }

  const existingBlocklist = loadCombatContributionLiveBlocklist(blocklistPath)
  const mergedBlocklist = {
    version: 1,
    generatedAt: new Date().toISOString(),
    blockedExactKeys: [...new Set([...existingBlocklist.blockedExactKeys, ...blockedExactKeys])],
    reasons: { ...existingBlocklist.reasons, ...blockReasons },
    entries: [
      ...(existingBlocklist.entries ?? []),
      ...blockEntries.filter(
        (entry) => !(existingBlocklist.entries ?? []).some((existing) => existing.key === entry.key),
      ),
    ],
  }

  await writeFile(blocklistPath, `${JSON.stringify(mergedBlocklist, null, 2)}\n`)

  const gradedProfiles = []
  for (const [uid, profileRows] of profileMap) {
    const latestRow = profileRows.reduce((latest, row) =>
      !latest || row.playedAt > latest.playedAt ? row : latest,
    )
    const playerTier = getRankTierFromRp(latestRow?.rpAfter ?? 0, null, CURRENT_DISPLAY_SEASON)
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

    primeCombatContributionLiveCaches({
      baselineDocument: participationDocument,
      blocklist: mergedBlocklist,
    })

    const graded = applyCharacterPerformanceGrades({
      rows: profileRows,
      characterStats: [...characterMap.values()],
      metaStatus: 'complete',
      playerTier,
    })

    gradedProfiles.push({
      profileId: hashUid(uid),
      characters: graded.map((stat) => ({
        characterNum: stat.characterNum,
        grade: stat.grade,
        gradeScore: stat.gradeScore,
        gradeRoleMetricMode: stat.gradeRoleMetricMode,
        gradeCombatMetricMode: stat.gradeCombatMetricMode,
        gradeCombatMetricFallbackReason: stat.gradeCombatMetricFallbackReason,
      })),
    })
  }

  const rawJsonNonNull = rows.filter((row) => row.rawJson != null).length
  const roleMetricsV1 = rows.filter((row) => row.roleMetricsVersion === 1).length

  const summary = {
    generatedAt: new Date().toISOString(),
    seasonId: CURRENT_DISPLAY_SEASON,
    teamKillConsistency: teamKillCheck,
    eligibleExactKeyCount: eligibleExactKeys.length,
    eligibleExactKeys: eligibleExactKeys.slice(0, 50),
    weaponGroupAttempts: weaponGroupAttempts.length,
    liveAppliedUserGroupCount: liveApplied.length,
    combatModeCounts,
    combatFallbackCounts,
    blockedExactKeyCount: mergedBlocklist.blockedExactKeys.length,
    blockedExactKeys: mergedBlocklist.blockedExactKeys,
    spotlightResults,
    liveApplied: liveApplied.slice(0, 100),
    gradedProfiles: gradedProfiles.slice(0, 20),
    dataIntegrity: {
      totalRows: rows.length,
      roleMetricsVersion1Rows: roleMetricsV1,
      rawJsonNonNullRows: rawJsonNonNull,
    },
  }

  await mkdir(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'live-combat-summary.json')
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`)

  console.log(
    JSON.stringify(
      {
        outputPath,
        blocklistPath,
        eligibleExactKeyCount: eligibleExactKeys.length,
        liveAppliedUserGroupCount: liveApplied.length,
        combatModeCounts,
        combatFallbackCounts,
        blockedExactKeyCount: mergedBlocklist.blockedExactKeys.length,
        teamKillConsistency: teamKillCheck,
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
