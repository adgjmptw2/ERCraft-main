#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import { getBaselineSnapshotMeta } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { loadCombatParticipationBaselineDocument } from '../dist/audit/combatParticipationBaselineBuilder.js'
import {
  auditFinisherOverlap,
  buildAllComparisonRows,
  formatRolloutAuditReport,
  groupRowsByExactKey,
  groupRowsByRole,
  groupRowsByTier,
  hashProfileId,
  pickRepresentativeByRole,
  summarizeRolloutRows,
  summarizeApplicationBreakdown,
} from '../dist/audit/gradeRolloutAudit.js'
import {
  buildWeaponGroupGradeExplanation,
} from '../dist/audit/gradeExplanation.js'
import { aggregateWeaponGroupStats } from '../dist/services/characterPerformanceGrade/metrics.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { playerMatchRowToGradeInput } from '../dist/services/characterPerformanceGrade/compute.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputDir = join(backendRoot, 'tmp', 'grade-rollout-audit')

const prisma = new PrismaClient()

async function resolvePlayedAtRange() {
  const aggregate = await prisma.playerMatch.aggregate({
    where: { gameMode: 'rank', displaySeasonId: CURRENT_DISPLAY_SEASON },
    _min: { playedAt: true },
    _max: { playedAt: true },
  })
  return {
    from: aggregate._min.playedAt?.toISOString() ?? null,
    to: aggregate._max.playedAt?.toISOString() ?? null,
  }
}

function buildExplanationForRow(row, rows, playedAtRange) {
  const role = lookupCharacterWeaponRole(row.characterNum, row.weaponTypeId)
  if (!role) return null
  const groupRows = rows.filter(
    (entry) =>
      hashProfileId(entry.uid) === row.anonymousProfileId &&
      entry.characterNum === row.characterNum &&
      entry.bestWeapon === row.weaponTypeId,
  )
  const matches = groupRows.map((entry) => playerMatchRowToGradeInput(entry)).filter(Boolean)
  const stats = aggregateWeaponGroupStats(row.characterNum, row.weaponTypeId, matches)
  if (!stats) return null
  const playerTierKey = row.playerTierKey
  return buildWeaponGroupGradeExplanation({
    stats,
    matches,
    role,
    playerTierKey,
    displaySeasonId: CURRENT_DISPLAY_SEASON,
    combatPlayedAtFrom: playedAtRange.from,
    combatPlayedAtTo: playedAtRange.to,
  })
}

async function main() {
  const playedAtRange = await resolvePlayedAtRange()
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank', displaySeasonId: CURRENT_DISPLAY_SEASON },
    select: {
      uid: true,
      characterNum: true,
      bestWeapon: true,
      rpAfter: true,
      placement: true,
      kills: true,
      assists: true,
      deaths: true,
      teamKills: true,
      damageToPlayer: true,
      victory: true,
      roleMetricsVersion: true,
      viewContribution: true,
      monsterKill: true,
      damageFromPlayer: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      playedAt: true,
    },
  })

  const comparisonRows = buildAllComparisonRows(rows)
  const appliedRows = comparisonRows.filter((row) => row.combatApplied)
  const summary = summarizeRolloutRows(comparisonRows)
  const appliedSummary = summarizeRolloutRows(appliedRows)
  const applicationBreakdown = summarizeApplicationBreakdown(comparisonRows)

  const buildExplanation = (row) => buildExplanationForRow(row, rows, playedAtRange)

  const dak = getBaselineSnapshotMeta()
  let combatDoc = null
  try {
    combatDoc = loadCombatParticipationBaselineDocument()
  } catch {
    combatDoc = null
  }
  const dakAt = dak.collectedAt ? Date.parse(dak.collectedAt) : null
  const combatAt = combatDoc?.generatedAt ? Date.parse(combatDoc.generatedAt) : null
  const gapDays =
    dakAt != null && combatAt != null ? Math.abs(combatAt - dakAt) / (1000 * 60 * 60 * 24) : null
  const combatSpanDays =
    playedAtRange.from && playedAtRange.to
      ? (Date.parse(playedAtRange.to) - Date.parse(playedAtRange.from)) / (1000 * 60 * 60 * 24)
      : null

  const baselineWarning = {
    dakSnapshotGeneratedAt: dak.collectedAt,
    dakPeriodDays: dak.periodDays,
    combatGeneratedAt: combatDoc?.generatedAt ?? null,
    combatPlayedAtFrom: playedAtRange.from,
    combatPlayedAtTo: playedAtRange.to,
    combatSpanDays,
    baselinePeriodGapDays: gapDays,
    warningGapOver14Days: (gapDays ?? 0) > 14,
    warningCombatSpanOver60Days: (combatSpanDays ?? 0) > 60,
    note: 'DAK.GG periodDays=7 static snapshot vs ERCraft S11 DB aggregation for combat baselines',
  }

  const leniUid = await (async () => {
    const normalized = '연서'.trim().toLowerCase()
    const binding = await prisma.profileNicknameBinding.findUnique({
      where: { normalizedNickname: normalized },
      select: { canonicalUid: true },
    })
    if (binding?.canonicalUid) return binding.canonicalUid
    const row = await prisma.playerMatch.findFirst({
      where: { nicknameSnapshot: '연서' },
      select: { uid: true },
      orderBy: { playedAt: 'desc' },
    })
    return row?.uid ?? null
  })()
  const leniRow = leniUid
    ? comparisonRows.find(
        (row) =>
          hashProfileId(leniUid) === row.anonymousProfileId &&
          row.characterNum === 69 &&
          row.weaponTypeId === 9,
      )
    : comparisonRows.find((row) => row.characterNum === 69 && row.weaponTypeId === 9)
  const leniExplanation = leniRow ? buildExplanation(leniRow) : null

  const files = {
    summary: join(outputDir, 'summary.json'),
    byRole: join(outputDir, 'by-role.json'),
    byTier: join(outputDir, 'by-tier.json'),
    byExactKey: join(outputDir, 'by-exact-key.json'),
    finisherOverlap: join(outputDir, 'finisher-overlap.json'),
    baselinePeriodWarning: join(outputDir, 'baseline-period-warning.json'),
    report: join(outputDir, 'report.txt'),
    leniExplanation: join(outputDir, 'leni-69-9-explanation.json'),
    representatives: join(outputDir, 'representatives-by-role.json'),
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(
    files.summary,
    `${JSON.stringify({ overall: summary, appliedOnly: appliedSummary, applicationBreakdown }, null, 2)}\n`,
  )
  await writeFile(files.byRole, `${JSON.stringify(groupRowsByRole(comparisonRows), null, 2)}\n`)
  await writeFile(files.byTier, `${JSON.stringify(groupRowsByTier(comparisonRows), null, 2)}\n`)
  await writeFile(files.byExactKey, `${JSON.stringify(groupRowsByExactKey(comparisonRows), null, 2)}\n`)
  await writeFile(
    files.finisherOverlap,
    `${JSON.stringify(auditFinisherOverlap(comparisonRows, buildExplanation), null, 2)}\n`,
  )
  await writeFile(files.baselinePeriodWarning, `${JSON.stringify(baselineWarning, null, 2)}\n`)
  await writeFile(
    files.report,
    `${formatRolloutAuditReport(summary)}\n${formatRolloutAuditReport(appliedSummary)}\n`,
  )
  await writeFile(files.leniExplanation, `${JSON.stringify(leniExplanation, null, 2)}\n`)
  await writeFile(
    files.representatives,
    `${JSON.stringify(pickRepresentativeByRole(comparisonRows, buildExplanation), null, 2)}\n`,
  )

  console.log(
    JSON.stringify(
      {
        ...files,
        totalGroups: comparisonRows.length,
        appliedGroups: appliedRows.length,
        appliedSummary,
        leniFound: leniExplanation != null,
        leniGrade: leniExplanation?.finalGrade ?? null,
        leniScore: leniExplanation?.finalScore ?? null,
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
