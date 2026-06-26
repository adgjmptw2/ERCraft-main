import type { PrismaClient } from '@prisma/client'

import { lookupCharacterWeaponRole } from './baselineStore.js'
import {
  classifyBestWeaponValue,
  type UnknownRoleReason,
} from './unknownRoleReason.js'
import {
  loadDetailRawJsonMap,
  loadParticipantWeaponMap,
  participantMapKey,
  resolveWeaponRecoveryForRow,
  type PlayerMatchWeaponRow,
  type WeaponRecoveryCandidate,
} from './unknownWeaponRecovery.js'
import { resolveUnknownCohortCutoff } from './unknownCohortCutoff.js'
import { getLocalCollectedGamesStatus } from './benchmarkStatus.js'

export interface UnknownWeaponAuditBreakdown {
  matchDetailExists: number
  matchParticipantExists: number
  rawJsonExists: number
  rawJsonParticipantMatched: number
  officialWeaponFieldPresent: number
  equipmentItemRecoverable: number
  unrecoverable: number
}

export interface UnknownCohortAuditSummary {
  totalRows: number
  unknownCount: number
  unknownRatePercent: number
  byPrimaryReason: Record<UnknownRoleReason, number>
  missingBestWeapon: number
  invalidBestWeapon: number
  baselineMissing: number
  matchDetailExists: number
  rawJsonParticipantMismatch: number
  recoverableCandidates: number
  unmappedCombos: Array<{ combo: string; count: number }>
}

export interface UnknownRoleAuditReport {
  generatedAt: string
  queryMode: 'rank'
  matchingMode: 'all'
  totalPlayerMatches: number
  rankPlayerMatches: number
  unknownCount: number
  unknownRatePercent: number
  unknownBefore: number
  byPrimaryReason: Record<UnknownRoleReason, number>
  missingBestWeaponBreakdown: UnknownWeaponAuditBreakdown
  unmappedCombos: Array<{ combo: string; count: number }>
  recoveryCandidates: number
  recoveryBySource: Record<string, number>
  sampleRecoveries: Array<Omit<WeaponRecoveryCandidate, 'rowId'> & { rowId: string }>
  cohortCutoffAt: string | null
  legacyCohort: UnknownCohortAuditSummary | null
  newCohort: UnknownCohortAuditSummary | null
  supportRoles: {
    healerSupportGames: number
    utilitySupportGames: number
    unknownGames: number
  } | null
}

function emptyReasonCounts(): Record<UnknownRoleReason, number> {
  return {
    'missing-best-weapon': 0,
    'invalid-best-weapon': 0,
    'participant-weapon-not-mapped': 0,
    'raw-detail-weapon-missing': 0,
    'weapon-item-mapping-missing': 0,
    'character-weapon-baseline-missing': 0,
    'character-metadata-missing': 0,
    'unsupported-mode': 0,
    'legacy-incomplete-row': 0,
    'resolved-role': 0,
  }
}

function classifyUnknownRow(
  row: {
    gameId: string
    uid: string
    characterNum: number
    bestWeapon: number | null
    rawJson: unknown
  },
  participantMap: Map<string, number | null>,
  detailMap: Map<string, unknown>,
): {
  isUnknown: boolean
  reason: UnknownRoleReason | 'resolved-role'
  unmappedCombo: string | null
  recoverable: boolean
  matchDetailExists: boolean
} {
  const weaponState = classifyBestWeaponValue(row.bestWeapon)
  if (weaponState !== 'valid') {
    const participantWeapon =
      participantMap.get(participantMapKey(row.gameId, row.uid, row.characterNum)) ?? null
    const detailRaw = detailMap.get(row.gameId) ?? null
    const recovery = resolveWeaponRecoveryForRow({
      row: row as PlayerMatchWeaponRow,
      participantBestWeapon: participantWeapon,
      detailRawJson: detailRaw,
    })
    return {
      isUnknown: true,
      reason: weaponState === 'missing' ? 'missing-best-weapon' : 'invalid-best-weapon',
      unmappedCombo: null,
      recoverable: recovery != null,
      matchDetailExists: detailRaw != null,
    }
  }
  const role = lookupCharacterWeaponRole(row.characterNum, row.bestWeapon!)
  if (role == null) {
    return {
      isUnknown: true,
      reason: 'character-weapon-baseline-missing',
      unmappedCombo: `${row.characterNum}:${row.bestWeapon}`,
      recoverable: false,
      matchDetailExists: false,
    }
  }
  return {
    isUnknown: false,
    reason: 'resolved-role',
    unmappedCombo: null,
    recoverable: false,
    matchDetailExists: false,
  }
}

function emptyCohortSummary(): UnknownCohortAuditSummary {
  return {
    totalRows: 0,
    unknownCount: 0,
    unknownRatePercent: 0,
    byPrimaryReason: emptyReasonCounts(),
    missingBestWeapon: 0,
    invalidBestWeapon: 0,
    baselineMissing: 0,
    matchDetailExists: 0,
    rawJsonParticipantMismatch: 0,
    recoverableCandidates: 0,
    unmappedCombos: [],
  }
}

function applyCohortRow(
  summary: UnknownCohortAuditSummary,
  classified: ReturnType<typeof classifyUnknownRow>,
  unmappedComboCounts: Map<string, number>,
): void {
  summary.totalRows += 1
  if (!classified.isUnknown) {
    summary.byPrimaryReason['resolved-role'] += 1
    return
  }
  summary.unknownCount += 1
  summary.byPrimaryReason[classified.reason] += 1
  if (classified.reason === 'missing-best-weapon') summary.missingBestWeapon += 1
  if (classified.reason === 'invalid-best-weapon') summary.invalidBestWeapon += 1
  if (classified.reason === 'character-weapon-baseline-missing') summary.baselineMissing += 1
  if (classified.matchDetailExists) summary.matchDetailExists += 1
  if (classified.recoverable) summary.recoverableCandidates += 1
  if (classified.unmappedCombo) {
    unmappedComboCounts.set(
      classified.unmappedCombo,
      (unmappedComboCounts.get(classified.unmappedCombo) ?? 0) + 1,
    )
  }
}

function finalizeCohortSummary(
  summary: UnknownCohortAuditSummary,
  unmappedComboCounts: Map<string, number>,
): UnknownCohortAuditSummary {
  return {
    ...summary,
    unknownRatePercent:
      summary.totalRows > 0
        ? Math.round((summary.unknownCount / summary.totalRows) * 10000) / 100
        : 0,
    unmappedCombos: [...unmappedComboCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([combo, count]) => ({ combo, count })),
  }
}

export async function auditUnknownRoleRows(
  prisma: PrismaClient,
  options: { sampleLimit?: number } = {},
): Promise<UnknownRoleAuditReport> {
  const sampleLimit = options.sampleLimit ?? 20
  const cohortCutoffAt = await resolveUnknownCohortCutoff()
  const cutoffMs = cohortCutoffAt ? Date.parse(cohortCutoffAt) : Number.NaN
  const status = await getLocalCollectedGamesStatus(prisma)
  const rows = await prisma.playerMatch.findMany({
    where: { gameMode: 'rank' },
    select: {
      id: true,
      uid: true,
      gameId: true,
      gameMode: true,
      characterNum: true,
      bestWeapon: true,
      rawJson: true,
      createdAt: true,
    },
  })

  const byPrimaryReason = emptyReasonCounts()
  const missingBreakdown: UnknownWeaponAuditBreakdown = {
    matchDetailExists: 0,
    matchParticipantExists: 0,
    rawJsonExists: 0,
    rawJsonParticipantMatched: 0,
    officialWeaponFieldPresent: 0,
    equipmentItemRecoverable: 0,
    unrecoverable: 0,
  }
  const unmappedComboCounts = new Map<string, number>()
  const recoveryBySource: Record<string, number> = {}
  const sampleRecoveries: UnknownRoleAuditReport['sampleRecoveries'] = []
  const legacySummary = emptyCohortSummary()
  const newSummary = emptyCohortSummary()
  const legacyUnmapped = new Map<string, number>()
  const newUnmapped = new Map<string, number>()

  const missingWeaponRows = rows.filter((row) => classifyBestWeaponValue(row.bestWeapon) !== 'valid')
  const gameIds = [...new Set(missingWeaponRows.map((row) => row.gameId))]
  const [participantMap, detailMap] = await Promise.all([
    loadParticipantWeaponMap(prisma, gameIds),
    loadDetailRawJsonMap(prisma, gameIds),
  ])

  let unknownBefore = 0
  for (const row of rows) {
    const classified = classifyUnknownRow(row, participantMap, detailMap)
    const cohortIsNew =
      Number.isFinite(cutoffMs) && row.createdAt.getTime() >= cutoffMs
    const cohortSummary = cohortIsNew ? newSummary : legacySummary
    const cohortUnmapped = cohortIsNew ? newUnmapped : legacyUnmapped
    applyCohortRow(cohortSummary, classified, cohortUnmapped)

    if (!classified.isUnknown) continue

    unknownBefore += 1
    byPrimaryReason[classified.reason] += 1

    if (
      classified.reason === 'missing-best-weapon' ||
      classified.reason === 'invalid-best-weapon'
    ) {
      const participantWeapon =
        participantMap.get(participantMapKey(row.gameId, row.uid, row.characterNum)) ?? null
      const detailRaw = detailMap.get(row.gameId) ?? null
      if (detailRaw != null) missingBreakdown.matchDetailExists += 1
      if (participantWeapon != null) missingBreakdown.matchParticipantExists += 1
      if (detailRaw != null || row.rawJson != null) missingBreakdown.rawJsonExists += 1

      const recovery = resolveWeaponRecoveryForRow({
        row: row as PlayerMatchWeaponRow,
        participantBestWeapon: participantWeapon,
        detailRawJson: detailRaw,
      })
      if (recovery) {
        recoveryBySource[recovery.source] = (recoveryBySource[recovery.source] ?? 0) + 1
        missingBreakdown.rawJsonParticipantMatched += 1
        missingBreakdown.officialWeaponFieldPresent += 1
        if (sampleRecoveries.length < sampleLimit) {
          sampleRecoveries.push({
            rowId: recovery.rowId.toString(),
            uid: recovery.uid,
            gameId: recovery.gameId,
            characterNum: recovery.characterNum,
            currentBestWeapon: recovery.currentBestWeapon,
            recoveredBestWeapon: recovery.recoveredBestWeapon,
            source: recovery.source,
            reason: recovery.reason,
          })
        }
      } else {
        missingBreakdown.unrecoverable += 1
      }
      continue
    }

    if (classified.unmappedCombo) {
      unmappedComboCounts.set(
        classified.unmappedCombo,
        (unmappedComboCounts.get(classified.unmappedCombo) ?? 0) + 1,
      )
    }
  }

  const totalPlayerMatches = await prisma.playerMatch.count()
  const healerSupportGames =
    status?.byRole.find((entry) => entry.role === '힐러 서포터')?.games ?? 0
  const utilitySupportGames =
    status?.byRole.find((entry) => entry.role === '유틸 서포터')?.games ?? 0
  return {
    generatedAt: new Date().toISOString(),
    queryMode: 'rank',
    matchingMode: 'all',
    totalPlayerMatches,
    rankPlayerMatches: rows.length,
    unknownCount: unknownBefore,
    unknownRatePercent:
      rows.length > 0 ? Math.round((unknownBefore / rows.length) * 10000) / 100 : 0,
    unknownBefore,
    byPrimaryReason,
    missingBestWeaponBreakdown: missingBreakdown,
    unmappedCombos: [...unmappedComboCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([combo, count]) => ({ combo, count })),
    recoveryCandidates: Object.values(recoveryBySource).reduce((sum, value) => sum + value, 0),
    recoveryBySource,
    sampleRecoveries,
    cohortCutoffAt,
    legacyCohort:
      Number.isFinite(cutoffMs) ? finalizeCohortSummary(legacySummary, legacyUnmapped) : null,
    newCohort:
      Number.isFinite(cutoffMs) ? finalizeCohortSummary(newSummary, newUnmapped) : null,
    supportRoles: status
      ? {
          healerSupportGames,
          utilitySupportGames,
          unknownGames: status.byRole.find((entry) => entry.role === 'unknown')?.games ?? 0,
        }
      : null,
  }
}
