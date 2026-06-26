#!/usr/bin/env node
import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'

import {
  buildWeaponGroupGradeExplanation,
  formatGradeExplanationText,
} from '../dist/audit/gradeExplanation.js'
import { hashProfileId } from '../dist/audit/gradeRolloutAudit.js'
import { lookupCharacterWeaponRole } from '../dist/services/characterPerformanceGrade/baselineStore.js'
import { playerMatchRowToGradeInput } from '../dist/services/characterPerformanceGrade/compute.js'
import { aggregateWeaponGroupStats } from '../dist/services/characterPerformanceGrade/metrics.js'
import { rankTierToGradeBaselineKey } from '../dist/services/characterPerformanceGrade/tierKey.js'
import { CURRENT_DISPLAY_SEASON } from '../dist/utils/seasonRankTierLadder.js'
import { getRankTierFromRp } from '../dist/utils/rankTier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(__dirname, '..')
const outputRoot = join(backendRoot, 'tmp', 'grade-explanations')

const prisma = new PrismaClient()

function parseArgs(argv) {
  const parsed = {
    nickname: '연서',
    characterNum: 69,
    weaponTypeId: 9,
  }
  for (const arg of argv) {
    if (arg.startsWith('--nickname=')) parsed.nickname = arg.split('=')[1] ?? parsed.nickname
    if (arg.startsWith('--character-num=')) {
      parsed.characterNum = Number(arg.split('=')[1]) || parsed.characterNum
    }
    if (arg.startsWith('--weapon-type-id=')) {
      parsed.weaponTypeId = Number(arg.split('=')[1]) || parsed.weaponTypeId
    }
  }
  return parsed
}

async function resolveUid(nickname) {
  const normalized = nickname.trim().toLowerCase()
  const binding = await prisma.profileNicknameBinding.findUnique({
    where: { normalizedNickname: normalized },
    select: { canonicalUid: true },
  })
  if (binding?.canonicalUid) return binding.canonicalUid
  const row = await prisma.playerMatch.findFirst({
    where: { nicknameSnapshot: nickname },
    select: { uid: true },
    orderBy: { playedAt: 'desc' },
  })
  return row?.uid ?? null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const uid = await resolveUid(args.nickname)
  if (!uid) {
    console.error(JSON.stringify({ error: 'profile-not-found', nickname: args.nickname }))
    process.exitCode = 1
    return
  }

  const rows = await prisma.playerMatch.findMany({
    where: {
      uid,
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
      characterNum: args.characterNum,
      bestWeapon: args.weaponTypeId,
    },
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
    orderBy: { playedAt: 'asc' },
  })

  const role = lookupCharacterWeaponRole(args.characterNum, args.weaponTypeId)
  const matches = rows.map((row) => playerMatchRowToGradeInput(row)).filter(Boolean)
  const stats = aggregateWeaponGroupStats(args.characterNum, args.weaponTypeId, matches)
  if (!role || !stats) {
    console.error(JSON.stringify({ error: 'insufficient-data', rows: rows.length }))
    process.exitCode = 1
    return
  }

  const latestRow = rows[rows.length - 1]
  const playerTier = getRankTierFromRp(latestRow?.rpAfter ?? 0, null, CURRENT_DISPLAY_SEASON)
  const playerTierKey = rankTierToGradeBaselineKey(playerTier) ?? 'meteorite_plus'
  const playedAtFrom = rows[0]?.playedAt?.toISOString() ?? null
  const playedAtTo = rows[rows.length - 1]?.playedAt?.toISOString() ?? null

  const explanation = buildWeaponGroupGradeExplanation({
    stats,
    matches,
    role,
    playerTierKey,
    combatPlayedAtFrom: playedAtFrom,
    combatPlayedAtTo: playedAtTo,
  })

  const anonymousId = hashProfileId(uid)
  const baseName = `${anonymousId}-${args.characterNum}-${args.weaponTypeId}`
  await mkdir(outputRoot, { recursive: true })
  const jsonPath = join(outputRoot, `${baseName}.json`)
  const txtPath = join(outputRoot, `${baseName}.txt`)

  await writeFile(jsonPath, `${JSON.stringify(explanation, null, 2)}\n`)
  await writeFile(txtPath, formatGradeExplanationText(explanation))

  console.log(formatGradeExplanationText(explanation))
  console.log(JSON.stringify({ jsonPath, txtPath, anonymousId }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
