#!/usr/bin/env node
/**
 * 39.38D — PlayerMatch ownership repair (dry-run default, --apply to write).
 * Usage: cd backend && npm run build && node scripts/repair-player-match-ownership.mjs [--apply]
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { uidToUserNum } from '../dist/external/bserMapper.js'
import { upsertPlayerMatches } from '../dist/cache/playerMatchStore.js'
import {
  mapParticipantToMatchSummary,
  readRawParticipantUid,
  selectMatchDetailParticipant,
} from '../dist/utils/playerMatchOwnership.js'
import { readMatchDetailFromDb } from '../dist/cache/matchDetailStore.js'

const APPLY = process.argv.includes('--apply')
const BSER_COBALT = 6
const TARGETS = [
  { label: '마인', uid: 'R23bDbKrxzzYc5bqXbz6kM9pQni0AQtMt3ujXFWTjsLD2n3DKMFIZ2Y6', userNum: 1009897353, nickname: '마인' },
  { label: '하잉', uid: '-Ewhk-EsVDWNR_M0CE-77u_rVCNmX7f7Rj0skNC6oGk03HM_dsu98ZTY', userNum: 460448438, nickname: '하잉' },
]

const prisma = new PrismaClient()

async function loadCobaltGameIds(uid) {
  const rows = await prisma.playerMatch.findMany({
    where: { uid, OR: [{ gameMode: 'cobalt' }, { matchingMode: BSER_COBALT }] },
    select: { gameId: true },
  })
  return rows.map((row) => row.gameId)
}

async function inspectRow(target, gameId) {
  const row = await prisma.playerMatch.findUnique({
    where: { uid_gameId: { uid: target.uid, gameId } },
  })
  const detailRow = await prisma.matchDetail.findUnique({ where: { gameId }, select: { rawJson: true } })
  const detail = await readMatchDetailFromDb(prisma, gameId)
  if (!detail) {
    return { gameId, status: 'no-match-detail' }
  }
  const rawJson = detailRow?.rawJson
  const rawGames = Array.isArray(rawJson) ? rawJson : rawJson && typeof rawJson === 'object' && Array.isArray(rawJson.games) ? rawJson.games : null
  const selected = selectMatchDetailParticipant(detail, rawGames, target.uid, target.userNum)
  if (!selected) {
    return { gameId, status: 'requested-player-not-found-in-match' }
  }
  const sourceUid = row ? readRawParticipantUid(row.rawJson) : null
  const contaminated =
    !row ||
    row.characterNum !== selected.participant.characterNum ||
    row.kills !== selected.participant.kills ||
    (sourceUid && sourceUid !== target.uid)
  if (!contaminated) return { gameId, status: 'ok' }
  return {
    gameId,
    status: row ? 'repairable' : 'missing-owner-row',
    before: row
      ? { characterNum: row.characterNum, kills: row.kills, sourceParticipantUid: sourceUid }
      : null,
    after: {
      characterNum: selected.participant.characterNum,
      kills: selected.participant.kills,
      sourceParticipantUid: target.uid,
    },
    selected,
    detail,
    rawGames,
  }
}

async function repairRow(target, inspected) {
  if (inspected.status !== 'repairable' && inspected.status !== 'missing-owner-row') return 'skipped'
  if (!APPLY) return 'dry-run'
  const match = mapParticipantToMatchSummary(
    inspected.gameId,
    target.uid,
    target.userNum,
    inspected.selected.participant,
    inspected.selected.rawGame,
    new Map(),
    null,
  )
  await upsertPlayerMatches(prisma, target.uid, [match], {
    apiSeasonId: inspected.detail.apiSeasonId ?? 39,
    displaySeasonId: inspected.detail.displaySeasonId ?? 11,
    matchingMode: inspected.detail.matchingMode ?? BSER_COBALT,
    matchingTeamMode: inspected.detail.matchingTeamMode ?? null,
    storeRawJson: Boolean(inspected.selected.rawGame),
    rawJson: inspected.selected.rawGame ?? undefined,
  })
  return 'applied'
}

async function deactivateCrossAliases() {
  const uids = TARGETS.map((target) => target.uid)
  const rows = await prisma.profileIdentityAlias.findMany({
    where: {
      isActive: true,
      canonicalUid: { in: uids },
      sourceUid: { in: uids },
    },
  })
  const cross = rows.filter((row) => row.canonicalUid !== row.sourceUid)
  if (!APPLY) return { crossAliasCount: cross.length, crossAliasIds: cross.map((row) => row.id) }
  for (const row of cross) {
    await prisma.profileIdentityAlias.update({ where: { id: row.id }, data: { isActive: false } })
  }
  return { crossAliasCount: cross.length, deactivated: cross.map((row) => row.id) }
}

async function main() {
  const auditPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports', 'player-match-ownership-audit-39.38D.json')
  const audit = JSON.parse(readFileSync(auditPath, 'utf8'))

  const gameIdSet = new Set()
  for (const target of TARGETS) {
    const cobaltIds = await loadCobaltGameIds(target.uid)
    for (const gameId of cobaltIds) gameIdSet.add(gameId)
  }
  for (const targetReport of audit.targets ?? []) {
    for (const row of targetReport.rows ?? []) gameIdSet.add(row.gameId)
  }

  const inspections = []
  const actions = []
  for (const target of TARGETS) {
    for (const gameId of gameIdSet) {
      const inspected = await inspectRow(target, gameId)
      inspections.push({ target: target.label, ...inspected })
      if (inspected.status === 'repairable' || inspected.status === 'missing-owner-row') {
        actions.push({ target: target.label, gameId, result: await repairRow(target, inspected) })
      }
    }
  }

  const aliasResult = await deactivateCrossAliases()
  const report = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    repairable: inspections.filter((row) => row.status === 'repairable' || row.status === 'missing-owner-row').length,
    unrepairable: inspections.filter((row) => row.status === 'no-match-detail' || row.status === 'requested-player-not-found-in-match').length,
    actions,
  }
  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports')
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, APPLY ? 'player-match-ownership-repair-39.38D-applied.json' : 'player-match-ownership-repair-39.38D-dry-run.json')
  writeFileSync(outPath, JSON.stringify({ ...report, aliasResult, inspections }, null, 2), 'utf8')
  console.log(JSON.stringify({ outPath, apply: APPLY, repairable: report.repairable, actions: actions.length, aliasResult }, null, 2))
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exitCode = 1
})