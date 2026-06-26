import { describe, expect, it } from 'vitest'

import { buildAnalysisListRows } from '@/analysis/playerAnalysisAdapter'
import type { PlayerAnalysisResponseDTO } from '@/types/playerAnalysis'

function sampleResponse(characterCount: number): PlayerAnalysisResponseDTO {
  const characters = Array.from({ length: characterCount }, (_, index) => ({
    type: 'character' as const,
    label: `캐릭터${index + 1}`,
    characterName: `캐릭터${index + 1}`,
    characterNum: index + 1,
    characterRank: index + 1,
    isTopCharacter: index < 3,
    lastPlayedAt: `2026-06-${String(20 - index).padStart(2, '0')}T00:00:00.000Z`,
    games: 10 - index,
    winRate: 50,
    top3Rate: 50,
    averagePlacement: 3,
    primaryRole: '탱커',
    overallScore: 70,
    grade: null,
    gradeDisplay: null,
    confidence: 'official' as const,
    metrics: [],
    radarAxes: [],
    comparison: {
      comparisonType: 'character-tier',
      samplePlayers: 40,
      tierBand: 'platinum',
      role: '탱커',
      benchmarkVersion: 'v2',
      displayLabel: '캐릭터 기준',
    },
  }))

  return {
    owner: { canonicalUid: 'uid', nickname: '테스트', seasonId: 11 },
    scope: 'all',
    sourceFingerprint: 'fp',
    computedAt: '2026-06-26T00:00:00.000Z',
    totals: {
      eligibleMatches: 50,
      rankMatches: 40,
      normalMatches: 10,
      excludedCobalt: 0,
      excludedUnion: 0,
      excludedDuplicate: 0,
      excludedOwnership: 0,
    },
    rows: [
      {
        type: 'overall',
        label: '전체',
        games: 50,
        winRate: 40,
        top3Rate: 50,
        averagePlacement: 3,
        primaryRole: '탱커',
        overallScore: 70,
        grade: null,
        gradeDisplay: '상위권',
        confidence: 'official',
        metrics: [],
        radarAxes: [],
        comparison: {
          comparisonType: 'role-tier',
          samplePlayers: 39,
          tierBand: 'platinum',
          role: '탱커',
          benchmarkVersion: 'v2',
          displayLabel: '탱커 기준',
        },
      },
      {
        type: 'recent20',
        label: '최근 20경기',
        games: 20,
        winRate: 50,
        top3Rate: 55,
        averagePlacement: 2.8,
        primaryRole: '탱커',
        overallScore: 72,
        grade: null,
        gradeDisplay: '상위권',
        confidence: 'official',
        metrics: [],
        radarAxes: [],
        comparison: {
          comparisonType: 'role-tier',
          samplePlayers: 30,
          tierBand: 'platinum',
          role: '탱커',
          benchmarkVersion: 'v2',
          displayLabel: '탱커 기준',
        },
      },
      ...characters,
    ],
  }
}

describe('playerAnalysisAdapter', () => {
  it('orders list rows as overall, recent20, then top characters only', () => {
    const rows = buildAnalysisListRows(sampleResponse(5))
    expect(rows.map((row) => row.key)).toEqual([
      'overall',
      'recent20',
      'character:1',
      'character:2',
      'character:3',
    ])
    expect(rows).toHaveLength(5)
  })

  it('shows gradeDisplay instead of withheld letter grade', () => {
    const rows = buildAnalysisListRows(sampleResponse(1))
    expect(rows[0]?.grade).toBe('상위권')
    expect(rows[0]?.grade).not.toBe('S+')
  })

  it('reorders top characters after rank-only refresh fixture', () => {
    const before = sampleResponse(4)
    const charBefore = before.rows.filter((row) => row.type === 'character')
    charBefore.find((row) => row.characterNum === 1)!.games = 8
    charBefore.find((row) => row.characterNum === 2)!.games = 6
    charBefore.find((row) => row.characterNum === 3)!.games = 5
    charBefore.find((row) => row.characterNum === 4)!.games = 4

    const after = sampleResponse(4)
    const charAfter = after.rows.filter((row) => row.type === 'character')
    charAfter.find((row) => row.characterNum === 1)!.games = 8
    charAfter.find((row) => row.characterNum === 2)!.games = 6
    charAfter.find((row) => row.characterNum === 3)!.games = 5
    charAfter.find((row) => row.characterNum === 4)!.games = 6

    const beforeRows = buildAnalysisListRows(before)
    const afterRows = buildAnalysisListRows(after)
    expect(beforeRows.map((row) => row.key)).toEqual([
      'overall',
      'recent20',
      'character:1',
      'character:2',
      'character:3',
    ])
    expect(afterRows.map((row) => row.key)).toEqual([
      'overall',
      'recent20',
      'character:1',
      'character:2',
      'character:4',
    ])
  })
})
