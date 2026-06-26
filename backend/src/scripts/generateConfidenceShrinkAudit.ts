import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  aggregateGlobalPriorMean,
  characterPriorMeanFromRoles,
  scoreToAggregateGrade,
  scoreToSharedFineAggregateGrade,
} from '../services/aggregateGrade.js'
import { computeMatchPerformanceGrade } from '../services/characterPerformanceGrade/compute.js'
import { applySampleConfidence, sampleConfidenceFactor, scoreToFineGrade } from '../services/characterPerformanceGrade/config.js'
import { lookupCharacterWeaponRole } from '../services/characterPerformanceGrade/baselineStore.js'
import { normalizeRankTier } from '../utils/rankTier.js'

const REPORT_DIR = path.resolve(process.cwd(), '..', 'reports', 'aggregate-grade')
const RAW_EXAMPLE_SCORE = 73.06
const NEUTRAL_SCORE = 65
const OLD_K = 15
const NEW_K = 1

type SampleExample = {
  sampleSize: number
  existingPolicy: 'insufficient/temp-policy' | 'graded'
  oldK15Confidence: number
  oldK15Score: number
  newConfidence: number
  newScore: number
  delta: number
  fineGrade: string
  aggregateGrade: string | null
}

type Distribution = Record<string, number>

type AuditMatchRow = {
  uid: string
  gameId: string
  apiSeasonId: number
  displaySeasonId: number
  gameMode: string
  playedAt: Date
  characterNum: number
  bestWeapon: number | null
  placement: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  teamKills: number | null
  damageToPlayer: number | null
  victory: boolean | null
  rpAfter: number | null
  rpDelta: number | null
  gameDuration: number | null
  damageFromPlayer: number | null
  protectAbsorb: number | null
  shieldDamageOffsetFromPlayer: number | null
  teamRecover: number | null
  ccTimeToPlayer: number | null
  viewContribution: number | null
  monsterKill: number | null
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function oldK15Score(sampleSize: number): number {
  const confidence = sampleSize / (sampleSize + OLD_K)
  return NEUTRAL_SCORE + (RAW_EXAMPLE_SCORE - NEUTRAL_SCORE) * confidence
}

function oldK15Adjusted(rawScore: number, sampleSize: number, priorMean: number): number {
  if (sampleSize <= 0) return priorMean
  const confidence = sampleSize / (sampleSize + OLD_K)
  return priorMean + (rawScore - priorMean) * confidence
}

function newPolicyAdjusted(rawScore: number, sampleSize: number, priorMean: number): number {
  if (sampleSize <= 0) return priorMean
  if (sampleSize >= 20) return rawScore
  const confidence = sampleSize / (sampleSize + NEW_K)
  return priorMean + (rawScore - priorMean) * confidence
}

function increment(distribution: Distribution, grade: string | null): void {
  const key = grade ?? 'null'
  distribution[key] = (distribution[key] ?? 0) + 1
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function sampleExample(sampleSize: number): SampleExample {
  const oldScore = oldK15Score(sampleSize)
  const newScore = applySampleConfidence(RAW_EXAMPLE_SCORE, sampleSize)
  return {
    sampleSize,
    existingPolicy: sampleSize < 5 ? 'insufficient/temp-policy' : 'graded',
    oldK15Confidence: round(sampleSize / (sampleSize + OLD_K), 6),
    oldK15Score: round(oldScore, 4),
    newConfidence: round(sampleConfidenceFactor(sampleSize), 6),
    newScore: round(newScore, 4),
    delta: round(newScore - oldScore, 4),
    fineGrade: scoreToFineGrade(newScore),
    aggregateGrade: scoreToAggregateGrade(newScore, 'character'),
  }
}

type ConfidenceShrinkReport = ReturnType<typeof buildReport> & {
  distributionImpact?: Awaited<ReturnType<typeof buildDistributionImpact>>
}

function formatMarkdown(report: ConfidenceShrinkReport): string {
  const lines: string[] = []
  lines.push('# Confidence Shrink Audit')
  lines.push('')
  lines.push(`Generated at: ${report.generatedAt}`)
  lines.push('')
  lines.push('## Formula')
  lines.push('')
  lines.push('- 1~4 games: existing insufficient/temp policy remains in the character grade path.')
  lines.push('- 5~19 games: `65 + (raw - 65) * n / (n + 1)`.')
  lines.push('- 20+ games: raw score is used without shrink.')
  lines.push('')
  lines.push('## Example raw score 73.06')
  lines.push('')
  lines.push('| games | old k15 | new | delta | confidence | grade | policy |')
  lines.push('|---:|---:|---:|---:|---:|---|---|')
  for (const row of report.examples) {
    lines.push(`| ${row.sampleSize} | ${row.oldK15Score.toFixed(2)} | ${row.newScore.toFixed(2)} | ${row.delta.toFixed(2)} | ${row.newConfidence.toFixed(4)} | ${row.fineGrade} | ${row.existingPolicy} |`)
  }
  lines.push('')
  lines.push('## 하잉 check')
  lines.push('')
  lines.push(`- 18 games with raw 73.06 -> ${report.haingExample.newScore.toFixed(2)} (${report.haingExample.fineGrade}).`)
  lines.push('- 20 games with raw 73.06 -> 73.06, because shrink is disabled at 20+ games.')
  lines.push('')
  if (report.distributionImpact) {
    lines.push('## Local DB distribution impact')
    lines.push('')
    lines.push(`- Rank rows evaluated: ${report.distributionImpact.sample.matchRows}`)
    lines.push(`- Character groups: ${report.distributionImpact.sample.characterGroups}, changed grades: ${report.distributionImpact.characterGrades.changed}, mean score delta: ${report.distributionImpact.characterGrades.meanDelta.toFixed(2)}`)
    lines.push(`- Overall groups: ${report.distributionImpact.sample.overallGroups}, changed grades: ${report.distributionImpact.overallGrades.changed}, mean score delta: ${report.distributionImpact.overallGrades.meanDelta.toFixed(2)}`)
    lines.push(`- Character old/new: ${JSON.stringify(report.distributionImpact.characterGrades.oldK15)} -> ${JSON.stringify(report.distributionImpact.characterGrades.newPolicy)}`)
    lines.push(`- Overall old/new: ${JSON.stringify(report.distributionImpact.overallGrades.oldK15)} -> ${JSON.stringify(report.distributionImpact.overallGrades.newPolicy)}`)
    lines.push('')
  }
  lines.push('## Runtime paths')
  lines.push('')
  for (const item of report.runtimePaths) {
    lines.push(`- ${item}`)
  }
  lines.push('')
  lines.push('## Scope guard')
  lines.push('')
  for (const item of report.scopeGuard) {
    lines.push(`- ${item}`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

function buildReport() {
  const examples = [1, 4, 5, 10, 18, 19, 20, 30].map(sampleExample)
  return {
    generatedAt: new Date().toISOString(),
    version: 'confidence-shrink-k1-20plus-raw.audit.v1',
    neutralScore: NEUTRAL_SCORE,
    oldFormula: {
      k: OLD_K,
      formula: '65 + (raw - 65) * n / (n + 15)',
    },
    newFormula: {
      k: NEW_K,
      formula: '65 + (raw - 65) * n / (n + 1) for 1<=n<20; raw for n>=20',
      note: 'Character runtime still treats fewer than 5 games as insufficient/provisional according to the existing grade policy.',
    },
    examples,
    haingExample: sampleExample(18),
    twentyGameExample: sampleExample(20),
    runtimePaths: [
      'backend/src/services/characterPerformanceGrade/config.ts: applySampleConfidence/sampleConfidenceFactor',
      'backend/src/services/characterPerformanceGrade/compute.ts: legacy/fallback character aggregate finalScore',
      'backend/src/services/aggregateGrade.ts: character aggregate v4 and overall aggregate v4 sample adjustment',
      'backend/src/audit/gradeExplanation.ts: explanation confidence factor now shares runtime helper',
      'backend/src/audit/gradeExplainabilityReport.ts: report confidence math now shares runtime helper',
    ],
    scopeGuard: [
      'Match grade formula was not changed.',
      'Ratio-to-score transforms, weights, grade cuts, production time curve, API contracts, and frontend UI were not changed.',
      'Role-time-curve v1.2 remains a shadow candidate and has runtimeApplied=false.',
      'This audit script reads local PlayerMatch rows only; it does not write DB rows or call external APIs.',
    ],
  }
}

async function buildDistributionImpact(prisma: PrismaClient) {
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank' },
    select: {
      uid: true,
      gameId: true,
      apiSeasonId: true,
      displaySeasonId: true,
      gameMode: true,
      playedAt: true,
      characterNum: true,
      bestWeapon: true,
      placement: true,
      kills: true,
      deaths: true,
      assists: true,
      teamKills: true,
      damageToPlayer: true,
      victory: true,
      rpAfter: true,
      rpDelta: true,
      gameDuration: true,
      damageFromPlayer: true,
      protectAbsorb: true,
      shieldDamageOffsetFromPlayer: true,
      teamRecover: true,
      ccTimeToPlayer: true,
      viewContribution: true,
      monsterKill: true,
    },
    orderBy: [{ uid: 'asc' }, { gameId: 'asc' }],
  }) as AuditMatchRow[]

  const skippedMatchRows: Record<string, number> = {}
  const characterGroups = new Map<string, Array<{ score: number; role: NonNullable<ReturnType<typeof lookupCharacterWeaponRole>> }>>()
  const overallGroups = new Map<string, Array<{ score: number; role: NonNullable<ReturnType<typeof lookupCharacterWeaponRole>> }>>()

  for (const row of rows) {
    const role = row.bestWeapon != null ? lookupCharacterWeaponRole(row.characterNum, row.bestWeapon) : null
    if (!role) {
      skippedMatchRows.missingRole = (skippedMatchRows.missingRole ?? 0) + 1
      continue
    }
    const playerTier = normalizeRankTier({
      rp: row.rpAfter,
      displaySeason: row.displaySeasonId,
    })
    const grade = computeMatchPerformanceGrade({
      row,
      playerTier,
      displaySeasonId: row.displaySeasonId,
    })
    if (grade.matchGradeScore == null || !Number.isFinite(grade.matchGradeScore)) {
      skippedMatchRows.missingMatchGrade = (skippedMatchRows.missingMatchGrade ?? 0) + 1
      continue
    }
    const entry = { score: grade.matchGradeScore, role }
    const characterKey = `${row.uid}:${row.apiSeasonId}:${row.characterNum}`
    const overallKey = `${row.uid}:${row.apiSeasonId}`
    characterGroups.set(characterKey, [...(characterGroups.get(characterKey) ?? []), entry])
    overallGroups.set(overallKey, [...(overallGroups.get(overallKey) ?? []), entry])
  }

  const characterOld: Distribution = {}
  const characterNew: Distribution = {}
  const characterDeltas: number[] = []
  let characterChanged = 0
  for (const entries of characterGroups.values()) {
    if (entries.length < 5) continue
    const raw = average(entries.map((entry) => entry.score))
    const prior = characterPriorMeanFromRoles(entries.map((entry) => ({ role: entry.role, weight: 1 })))
    const oldScore = oldK15Adjusted(raw, entries.length, prior)
    const newScore = newPolicyAdjusted(raw, entries.length, prior)
    const oldGrade = scoreToSharedFineAggregateGrade(oldScore)
    const newGrade = scoreToSharedFineAggregateGrade(newScore)
    increment(characterOld, oldGrade)
    increment(characterNew, newGrade)
    characterDeltas.push(newScore - oldScore)
    if (oldGrade !== newGrade) characterChanged += 1
  }

  const overallOld: Distribution = {}
  const overallNew: Distribution = {}
  const overallDeltas: number[] = []
  let overallChanged = 0
  for (const entries of overallGroups.values()) {
    if (entries.length < 5) continue
    const raw = average(entries.map((entry) => entry.score))
    const prior = aggregateGlobalPriorMean()
    const oldScore = oldK15Adjusted(raw, entries.length, prior)
    const newScore = newPolicyAdjusted(raw, entries.length, prior)
    const oldGrade = scoreToSharedFineAggregateGrade(oldScore)
    const newGrade = scoreToSharedFineAggregateGrade(newScore)
    increment(overallOld, oldGrade)
    increment(overallNew, newGrade)
    overallDeltas.push(newScore - oldScore)
    if (oldGrade !== newGrade) overallChanged += 1
  }

  return {
    sample: {
      uidCount: new Set(rows.map((row) => row.uid)).size,
      matchRows: rows.length,
      characterGroups: characterDeltas.length,
      overallGroups: overallDeltas.length,
      skippedMatchRows,
    },
    characterGrades: {
      oldK15: characterOld,
      newPolicy: characterNew,
      changed: characterChanged,
      meanDelta: round(average(characterDeltas), 4),
    },
    overallGrades: {
      oldK15: overallOld,
      newPolicy: overallNew,
      changed: overallChanged,
      meanDelta: round(average(overallDeltas), 4),
    },
  }
}

export async function generateConfidenceShrinkAudit(): Promise<{
  jsonPath: string
  markdownPath: string
}> {
  const prisma = new PrismaClient()
  try {
    const report: ConfidenceShrinkReport = {
      ...buildReport(),
      distributionImpact: await buildDistributionImpact(prisma),
    }
    await mkdir(REPORT_DIR, { recursive: true })
    const jsonPath = path.join(REPORT_DIR, 'confidence-shrink-audit.json')
    const markdownPath = path.join(REPORT_DIR, 'confidence-shrink-comparison.md')
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await writeFile(markdownPath, formatMarkdown(report), 'utf8')
    return { jsonPath, markdownPath }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await generateConfidenceShrinkAudit()
  console.log(JSON.stringify(result, null, 2))
}
