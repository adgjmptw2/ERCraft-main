#!/usr/bin/env node
/**
 * DB matchDetail rawJson에서 finalInfusion 코드 관측 집계 (개발용).
 * 신규 match detail API 호출 없음.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const CACHE_DIR = join(ROOT, '.cache', 'cobalt-infusion-discovery')
const OUT_PATH = join(CACHE_DIR, 'observation-report.json')
const CATALOG_PATH = join(ROOT, 'src', 'data', 'cobaltInfusions.generated.json')

const prisma = new PrismaClient()

function parseBoughtInfusion(raw) {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      return null
    }
    return null
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  return null
}

function loadCatalogIndex() {
  if (!existsSync(CATALOG_PATH)) return new Map()
  const body = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
  const map = new Map()
  for (const entry of body.catalog ?? []) {
    map.set(entry.apiCode, entry)
  }
  return map
}

async function main() {
  const catalogByCode = loadCatalogIndex()
  const rows = await prisma.matchDetail.findMany({
    where: { gameMode: 'cobalt' },
    orderBy: { playedAt: 'desc' },
    select: {
      gameId: true,
      apiSeasonId: true,
      matchingMode: true,
      rawJson: true,
    },
  })

  const finalStats = new Map()
  const boughtKeyStats = new Map()

  for (const row of rows) {
    const games = Array.isArray(row.rawJson) ? row.rawJson : []
    for (const game of games) {
      if (!game || typeof game !== 'object') continue
      const versionMajor = game.versionMajor ?? null
      const versionMinor = game.versionMinor ?? null
      const seasonId = game.seasonId ?? row.apiSeasonId ?? null

      if (Array.isArray(game.finalInfusion)) {
        for (const rawCode of game.finalInfusion) {
          if (typeof rawCode !== 'number' || !Number.isInteger(rawCode)) continue
          const existing = finalStats.get(rawCode) ?? {
            code: rawCode,
            occurrenceCount: 0,
            gameIds: new Set(),
            seasonIds: new Set(),
            versions: new Set(),
          }
          existing.occurrenceCount += 1
          existing.gameIds.add(String(row.gameId))
          if (seasonId !== null) existing.seasonIds.add(seasonId)
          if (versionMajor !== null && versionMinor !== null) {
            existing.versions.add(`${versionMajor}.${versionMinor}`)
          }
          finalStats.set(rawCode, existing)
        }
      }

      const bought = parseBoughtInfusion(game.boughtInfusion)
      if (bought) {
        for (const key of Object.keys(bought)) {
          const numeric = Number(key)
          const existing = boughtKeyStats.get(key) ?? {
            key,
            numericKey: Number.isFinite(numeric) ? numeric : null,
            occurrenceCount: 0,
            gameIds: new Set(),
          }
          existing.occurrenceCount += 1
          existing.gameIds.add(String(row.gameId))
          boughtKeyStats.set(key, existing)
        }
      }
    }
  }

  const observedCodes = [...finalStats.keys()].filter((code) => code > 0).sort((a, b) => a - b)
  const entries = observedCodes.map((code) => {
    const stat = finalStats.get(code)
    const catalog = catalogByCode.get(code) ?? null
    return {
      code,
      occurrenceCount: stat.occurrenceCount,
      gameIdCount: stat.gameIds.size,
      seasonIds: [...stat.seasonIds].sort((a, b) => a - b),
      versions: [...stat.versions].sort(),
      inCatalog: Boolean(catalog),
      nameVerified: Boolean(catalog?.nameVerified ?? catalog?.verified),
      hasKoName: Boolean(catalog?.koName),
      hasEnName: Boolean(catalog?.enName),
      assetVerified: Boolean(catalog?.assetVerified ?? catalog?.assetSlug),
      resolutionStatus: catalog?.resolutionStatus ?? 'missing_from_catalog',
    }
  })

  const boughtOnly = [...boughtKeyStats.values()]
    .map((row) => ({
      key: row.key,
      numericKey: row.numericKey,
      occurrenceCount: row.occurrenceCount,
      gameIdCount: row.gameIds.size,
      inFinalInfusion: finalStats.has(row.numericKey ?? NaN),
    }))
    .filter((row) => row.numericKey !== null && !finalStats.has(row.numericKey))
    .sort((a, b) => a.numericKey - b.numericKey)

  const report = {
    generatedAt: new Date().toISOString(),
    matchDetailRowCount: rows.length,
    observedFinalInfusionCodes: observedCodes,
    observedEntries: entries,
    boughtOnlyKeys: boughtOnly,
    includesZeroInFinalInfusion: finalStats.has(0),
  }

  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`)

  console.log(
    JSON.stringify(
      {
        outPath: OUT_PATH,
        matchDetailRowCount: report.matchDetailRowCount,
        observedCodeCount: observedCodes.length,
        boughtOnlyKeys: boughtOnly.map((row) => row.numericKey),
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
