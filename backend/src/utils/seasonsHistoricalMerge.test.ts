import { describe, expect, it } from 'vitest'

import type { SeasonRecordContract } from '../contracts/season.js'
import { mergeSeasonsWithHistoricalRecords } from './seasonsHistoricalMerge.js'

function seasonRow(
  seasonNumber: number,
  overrides: Partial<SeasonRecordContract> & {
    rank: SeasonRecordContract['rank']
    tier: string
  },
): SeasonRecordContract {
  return {
    seasonNumber,
    wins: 10,
    losses: 5,
    games: 15,
    avgPlacement: 3,
    kda: 2.5,
    top3Rate: 40,
    winRate: 66.7,
    played: true,
    ...overrides,
  }
}

describe('mergeSeasonsWithHistoricalRecords', () => {
  it('restores master tier from historical cache when stats-only row is mithril', () => {
    const current = [
      seasonRow(10, {
        rank: { tier: '\uBBF8\uC2A4\uB9B4', rp: 8400 },
        tier: '\uBBF8\uC2A4\uB9B4',
      }),
    ]
    const historical = [
      seasonRow(10, {
        rank: { tier: '\uC774\uD130\uB2C8\uD2F0', rp: 8400, rank: 12 },
        tier: '\uC774\uD130\uB2C8\uD2F0',
      }),
    ]

    const merged = mergeSeasonsWithHistoricalRecords(current, historical)
    expect(merged[0]?.rank.tier).toBe('\uC774\uD130\uB2C8\uD2F0')
    expect(merged[0]?.rank.rank).toBe(12)
    expect(merged[0]?.tier).toBe('\uC774\uD130\uB2C8\uD2F0')
  })

  it('keeps current row when rank and master tier are already present', () => {
    const current = [
      seasonRow(11, {
        rank: { tier: '\uC774\uD130\uB2C8\uD2F0', rp: 9000, rank: 3 },
        tier: '\uC774\uD130\uB2C8\uD2F0',
      }),
    ]
    const historical = [
      seasonRow(11, {
        rank: { tier: '\uBBF8\uC2A4\uB9B4', rp: 9000 },
        tier: '\uBBF8\uC2A4\uB9B4',
      }),
    ]

    const merged = mergeSeasonsWithHistoricalRecords(current, historical)
    expect(merged[0]?.rank.tier).toBe('\uC774\uD130\uB2C8\uD2F0')
    expect(merged[0]?.rank.rank).toBe(3)
  })

  it('picks the best historical hint when multiple cache chunks exist', () => {
    const current = [
      seasonRow(9, {
        rank: { tier: '\uBBF8\uC2A4\uB9B4', rp: 8300 },
        tier: '\uBBF8\uC2A4\uB9B4',
      }),
    ]
    const historical = [
      seasonRow(9, {
        rank: { tier: '\uBBF8\uC2A4\uB9B4', rp: 8300 },
        tier: '\uBBF8\uC2A4\uB9B4',
      }),
      seasonRow(9, {
        rank: { tier: '\uB370\uBBF8\uAC13', rp: 8300, rank: 88 },
        tier: '\uB370\uBBF8\uAC13',
      }),
    ]

    const merged = mergeSeasonsWithHistoricalRecords(current, historical)
    expect(merged[0]?.rank.tier).toBe('\uB370\uBBF8\uAC13')
    expect(merged[0]?.rank.rank).toBe(88)
  })
})
