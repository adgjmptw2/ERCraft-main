#!/usr/bin/env node
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function parseBoughtInfusion(raw) {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      return null
    }
    return null
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw
  }
  return null
}

function readInfusionFields(game) {
  if (!game || typeof game !== 'object') return null
  const boughtInfusion = parseBoughtInfusion(game.boughtInfusion)
  return {
    nickname: typeof game.nickname === 'string' ? game.nickname : null,
    finalInfusion: game.finalInfusion ?? null,
    boughtInfusion,
    matchingMode: game.matchingMode ?? null,
    seasonId: game.seasonId ?? null,
    versionMajor: game.versionMajor ?? null,
    versionMinor: game.versionMinor ?? null,
  }
}

async function main() {
  const rows = await prisma.matchDetail.findMany({
    where: { gameMode: 'cobalt' },
    take: 20,
    orderBy: { playedAt: 'desc' },
    select: {
      gameId: true,
      apiSeasonId: true,
      matchingMode: true,
      rawJson: true,
    },
  })

  const samples = []
  const finalCodes = new Set()
  const boughtKeys = new Set()

  for (const row of rows) {
    const games = Array.isArray(row.rawJson) ? row.rawJson : []
    const participants = games
      .map(readInfusionFields)
      .filter((entry) => entry && (entry.finalInfusion || entry.boughtInfusion))

    for (const p of participants) {
      if (Array.isArray(p.finalInfusion)) {
        for (const code of p.finalInfusion) {
          if (typeof code === 'number') finalCodes.add(code)
        }
      }
      if (p.boughtInfusion) {
        for (const key of Object.keys(p.boughtInfusion)) {
          boughtKeys.add(key)
        }
      }
    }

    if (participants.length > 0) {
      samples.push({
        gameId: row.gameId,
        apiSeasonId: row.apiSeasonId,
        matchingMode: row.matchingMode,
        participants: participants.slice(0, 4),
      })
    }
  }

  const intersection = [...finalCodes].filter((code) => boughtKeys.has(String(code)))
  const boughtOnly = [...boughtKeys]
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value))
    .filter((value) => !finalCodes.has(value))

  console.log(
    JSON.stringify(
      {
        matchCount: rows.length,
        sampleCount: samples.length,
        samples: samples.slice(0, 10),
        uniqueFinalInfusionCodes: [...finalCodes].sort((a, b) => a - b),
        uniqueBoughtInfusionKeys: [...boughtKeys].sort(),
        intersectionFinalAndBought: intersection.sort((a, b) => a - b),
        boughtOnlyNumericKeysSample: boughtOnly.sort((a, b) => a - b).slice(0, 20),
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
