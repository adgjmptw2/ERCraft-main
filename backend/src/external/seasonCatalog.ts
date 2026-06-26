import type { BserClient, BserSeasonRow } from './bserClient.js'

export type { BserSeasonRow }

/** BSER Season 테이블 이름에서 숫자 추출 (Season20 → 20, Pre-Season11 → 11) */
export function parseBserSeasonNumber(seasonName: string): number | null {
  const match = /^(?:Pre-)?Season(\d+)$/.exec(seasonName.trim())
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * BSER Season 테이블 번호 → 플레이어/UI 시즌 (S1~S11).
 * 패치 11.0 현재 시즌 = BSER row "Season20" → S11 (동일 시작일 2026-05-07).
 * Season10~Season20 구간은 S1~S11로 매핑한다.
 */
export function bserSeasonNumberToPlayerSeason(bserSeasonNumber: number): number {
  if (bserSeasonNumber >= 10) return bserSeasonNumber - 9
  return bserSeasonNumber
}

function isRankedSeasonName(seasonName: string): boolean {
  return /^Season\d+$/.test(seasonName.trim())
}

export class SeasonCatalog {
  private readonly apiToDisplay = new Map<number, number>()
  private readonly displayToApi = new Map<number, number>()
  private currentApiSeasonId: number | null = null

  constructor(rows: BserSeasonRow[]) {
    const byDisplay = new Map<number, BserSeasonRow[]>()

    for (const row of rows) {
      const bserNumber = parseBserSeasonNumber(row.seasonName)
      if (bserNumber === null) continue

      const display = bserSeasonNumberToPlayerSeason(bserNumber)
      this.apiToDisplay.set(row.seasonID, display)

      const bucket = byDisplay.get(display) ?? []
      bucket.push(row)
      byDisplay.set(display, bucket)

      if (row.isCurrent === 1) {
        this.currentApiSeasonId = row.seasonID
      }
    }

    for (const [display, bucket] of byDisplay) {
      const ranked = bucket.filter((row) => isRankedSeasonName(row.seasonName))
      const pool = ranked.length > 0 ? ranked : bucket
      const preferred = pool.reduce((best, row) =>
        row.seasonID > best.seasonID ? row : best,
      )
      this.displayToApi.set(display, preferred.seasonID)
    }
  }

  displayForApiId(apiSeasonId: number): number | null {
    if (apiSeasonId === 0) {
      return this.currentDisplaySeason()
    }
    return this.apiToDisplay.get(apiSeasonId) ?? null
  }

  apiIdForDisplay(displaySeason: number): number | null {
    return this.displayToApi.get(displaySeason) ?? null
  }

  currentApiSeasonIdOrNull(): number | null {
    return this.currentApiSeasonId
  }

  currentDisplaySeason(): number | null {
    if (this.currentApiSeasonId === null) return null
    return this.displayForApiId(this.currentApiSeasonId)
  }

  maxDisplaySeason(): number {
    if (this.displayToApi.size === 0) return 11
    return Math.max(...this.displayToApi.keys())
  }
}

export async function loadSeasonCatalog(bser: BserClient): Promise<SeasonCatalog> {
  const rows = await bser.getSeasonRows()
  return new SeasonCatalog(rows)
}
