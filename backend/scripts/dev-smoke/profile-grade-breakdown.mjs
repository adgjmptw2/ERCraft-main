#!/usr/bin/env node
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

import { applyCharacterPerformanceGrades } from '../../dist/services/characterPerformanceGrade/compute.js'
import { formatComboDisplayName } from '../../dist/utils/comboDisplayName.js'
import { getRankTierFromRp } from '../../dist/utils/rankTier.js'
import { CURRENT_DISPLAY_SEASON } from '../../dist/utils/seasonRankTierLadder.js'

const nickname = process.argv[2] ?? '연서'
const prisma = new PrismaClient()

async function resolveUid(targetNickname) {
  const normalized = targetNickname.trim().toLowerCase()
  const binding = await prisma.profileNicknameBinding.findUnique({
    where: { normalizedNickname: normalized },
    select: { canonicalUid: true },
  })
  if (binding?.canonicalUid) return binding.canonicalUid

  const row = await prisma.playerMatch.findFirst({
    where: { nicknameSnapshot: targetNickname },
    select: { uid: true },
    orderBy: { playedAt: 'desc' },
  })
  return row?.uid ?? null
}

async function main() {
  const uid = await resolveUid(nickname)
  if (!uid) {
    console.log(JSON.stringify({ error: 'profile-not-found', nickname }))
    return
  }

  const rows = await prisma.playerMatch.findMany({
    where: {
      uid,
      gameMode: 'rank',
      displaySeasonId: CURRENT_DISPLAY_SEASON,
    },
    select: {
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
    },
  })

  const playerTier = getRankTierFromRp(rows[0]?.rpAfter ?? null, null, CURRENT_DISPLAY_SEASON)
  const weaponByChar = new Map()
  for (const row of rows) {
    const bucket = weaponByChar.get(row.characterNum) ?? new Map()
    bucket.set(row.bestWeapon, (bucket.get(row.bestWeapon) ?? 0) + 1)
    weaponByChar.set(row.characterNum, bucket)
  }

  const charMap = new Map()
  for (const row of rows) {
    const stat =
      charMap.get(row.characterNum) ?? {
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
    stat.kills += row.kills ?? 0
    stat.assists += row.assists ?? 0
    stat.deaths += row.deaths ?? 0
    charMap.set(row.characterNum, stat)
  }

  for (const stat of charMap.values()) {
    stat.winRate = stat.games > 0 ? (stat.wins / stat.games) * 100 : 0
    stat.avgKills = stat.games > 0 ? stat.kills / stat.games : 0
    stat.kda = stat.deaths > 0 ? (stat.kills + stat.assists) / stat.deaths : stat.kills + stat.assists
  }

  const graded = applyCharacterPerformanceGrades({
    rows,
    characterStats: [...charMap.values()],
    metaStatus: 'complete',
    playerTier,
  })

  graded.sort((a, b) => (b.gradeScore ?? 0) - (a.gradeScore ?? 0))

  const top = graded.slice(0, 10).map((entry) => {
    const weapons = weaponByChar.get(entry.characterNum)
    const primaryWeapon = weapons
      ? [...weapons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      : null
    return {
      characterNum: entry.characterNum,
      primaryWeapon,
      label:
        primaryWeapon != null
          ? formatComboDisplayName(entry.characterNum, primaryWeapon)
          : String(entry.characterNum),
      games: entry.games,
      winRate: Number(entry.winRate?.toFixed?.(1) ?? entry.winRate),
      grade: entry.grade,
      gradeScore: entry.gradeScore,
      gradeRole: entry.gradeRole,
      gradeRoleMetricMode: entry.gradeRoleMetricMode,
      gradeCombatMetricMode: entry.gradeCombatMetricMode,
      gradeCombatMetricFallbackReason: entry.gradeCombatMetricFallbackReason,
      gradeUsedFallback: entry.gradeUsedFallback,
    }
  })

  console.log(
    JSON.stringify(
      {
        nickname,
        playerTier,
        totalRankRows: rows.length,
        characterCount: graded.length,
        topCharacters: top,
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
