import { describe, expect, it } from 'vitest'

import {
  bserSeasonNumberToPlayerSeason,
  parseBserSeasonNumber,
  SeasonCatalog,
  type BserSeasonRow,
} from './seasonCatalog.js'

const FIXTURE: BserSeasonRow[] = [
  { seasonID: 19, seasonName: 'Season10', isCurrent: 0 },
  { seasonID: 21, seasonName: 'Season11', isCurrent: 0 },
  { seasonID: 37, seasonName: 'Season19', isCurrent: 0 },
  { seasonID: 38, seasonName: 'Pre-Season20', isCurrent: 0 },
  { seasonID: 39, seasonName: 'Season20', isCurrent: 1 },
]

describe('seasonCatalog', () => {
  it('bserSeasonNumberToPlayerSeason — Season20 → S11', () => {
    expect(bserSeasonNumberToPlayerSeason(20)).toBe(11)
    expect(bserSeasonNumberToPlayerSeason(19)).toBe(10)
    expect(bserSeasonNumberToPlayerSeason(10)).toBe(1)
  })

  it('parseBserSeasonNumber', () => {
    expect(parseBserSeasonNumber('Season20')).toBe(20)
    expect(parseBserSeasonNumber('Pre-Season11')).toBe(11)
  })

  it('현재 시즌 — Season20 row → 표시 S11', () => {
    const catalog = new SeasonCatalog(FIXTURE)
    expect(catalog.currentDisplaySeason()).toBe(11)
    expect(catalog.apiIdForDisplay(11)).toBe(39)
    expect(catalog.apiIdForDisplay(10)).toBe(37)
  })

  it('seasonId 0 → 현재 표시 시즌', () => {
    const catalog = new SeasonCatalog(FIXTURE)
    expect(catalog.displayForApiId(0)).toBe(11)
  })
})
