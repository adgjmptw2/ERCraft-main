import { describe, expect, it } from 'vitest'

import type { MatchSummaryContract } from '../contracts/player.js'
import type { BserCharacterStat, BserUserStat } from '../external/bserClient.js'
import {
  buildCharacterAggregatesFromMatches,
  buildCharacterAggregatesFromStats,
  buildRpSeriesFromMatches,
  buildSeasonAggregate,
  buildSeasonAggregateCoverage,
  normalizeCoverageCollectedGames,
} from './seasonAggregateBuilder.js'

function stat(overrides: Partial<BserUserStat> = {}): BserUserStat {
  return {
    seasonId: 39,
    matchingMode: 3,
    matchingTeamMode: 3,
    mmr: 8300,
    nickname: 'Tester',
    rank: 10,
    rankSize: 1000,
    totalGames: 20,
    totalWins: 5,
    totalTeamKills: 100,
    totalDeaths: 30,
    averageRank: 4,
    averageKills: 3,
    averageAssistants: 4,
    top1: 0.1,
    top3: 0.4,
    ...overrides,
  }
}

function characterStat(
  overrides: Partial<BserCharacterStat> = {},
): BserCharacterStat {
  return {
    characterCode: 19,
    totalGames: 12,
    maxKillings: 9,
    top3: 6,
    wins: 3,
    averageRank: 4,
    ...overrides,
  }
}

function match(
  overrides: Partial<MatchSummaryContract> & Pick<MatchSummaryContract, 'matchId'>,
): MatchSummaryContract {
  return {
    userNum: 123,
    characterNum: 19,
    characterName: '엠마',
    placement: 2,
    kills: 3,
    deaths: 1,
    assists: 2,
    gameStartedAt: '2026-06-10T10:00:00+09:00',
    victory: false,
    seasonNumber: 11,
    gameMode: 'rank',
    ...overrides,
  }
}

describe('seasonAggregateBuilder', () => {
  it('stats characterStats를 우선 SeasonCharacterAggregateContract로 변환', () => {
    const rows = buildCharacterAggregatesFromStats([
      stat({
        characterStats: [
          characterStat({
            characterCode: 11,
            totalGames: 20,
            wins: 8,
            averageRank: 3.5,
          }),
        ],
      }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      characterNum: 11,
      games: 20,
      wins: 8,
      winRate: 40,
      avgRank: 3.5,
      avgDamage: null,
      gradeLabel: null,
    })
  })

  it('stats characterStats 이름은 정적 character map으로 resolve', () => {
    const rows = buildCharacterAggregatesFromStats([
      stat({
        characterStats: [
          characterStat({
            characterCode: 56,
            totalGames: 19,
            wins: 7,
          }),
        ],
      }),
    ])

    expect(rows[0]).toMatchObject({
      characterNum: 56,
      characterName: '피올로',
    })
  })

  it('stats에 API KDA 값이 있으면 우선 사용', () => {
    const row = {
      ...characterStat({ characterCode: 7 }),
      kills: 10,
      assists: 5,
      deaths: 10,
      kda: 9.5,
    } satisfies BserCharacterStat & {
      kills: number
      assists: number
      deaths: number
      kda: number
    }
    const rows = buildCharacterAggregatesFromStats([stat({ characterStats: [row] })])

    expect(rows[0]?.kda).toBe(9.5)
  })

  it('단일 캐릭터 stats가 시즌 전체와 일치하면 시즌 combat 값을 보강', () => {
    const rows = buildCharacterAggregatesFromStats([
      stat({
        totalGames: 20,
        totalTeamKills: 100,
        totalDeaths: 10,
        averageKills: 3,
        averageAssistants: 4,
        characterStats: [
          characterStat({
            characterCode: 7,
            totalGames: 20,
            wins: 5,
          }),
        ],
      }),
    ])

    expect(rows[0]).toMatchObject({
      characterNum: 7,
      kills: 60,
      assists: 80,
      deaths: 10,
      kda: 14,
      avgKills: 3,
      avgTeamKills: 5,
      avgDamage: null,
      gradeLabel: null,
    })
  })

  it('stats가 없으면 matches fallback으로 캐릭터 통계를 계산', () => {
    const rows = buildCharacterAggregatesFromMatches(
      [
        match({ matchId: 'a', kills: 4, assists: 2, deaths: 1, teamKills: 10, damageToPlayers: 12000 }),
        match({ matchId: 'b', kills: 2, assists: 4, deaths: 2, teamKills: 8, damageToPlayers: 14000 }),
      ],
      11,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      games: 2,
      kills: 6,
      assists: 6,
      deaths: 3,
      kda: 4,
      avgKills: 3,
      avgTeamKills: 9,
      avgDamage: 13000,
    })
  })

  it('matches fallback에서 RP 합계를 집계한다', () => {
    const rows = buildCharacterAggregatesFromMatches(
      [
        match({ matchId: 'a', rpDelta: 200 }),
        match({ matchId: 'b', rpDelta: -300 }),
      ],
      11,
    )

    expect(rows[0]?.totalRpDelta).toBe(-100)
  })

  it('matches fallback에서 deaths=0이어도 KDA crash 없이 계산', () => {
    const rows = buildCharacterAggregatesFromMatches(
      [match({ matchId: 'a', kills: 5, assists: 3, deaths: 0 })],
      11,
    )

    expect(rows[0]?.kda).toBe(8)
  })

  it('damage null과 0을 구분', () => {
    const zeroDamage = buildCharacterAggregatesFromMatches(
      [match({ matchId: 'a', damageToPlayers: 0 })],
      11,
    )
    const missingDamage = buildCharacterAggregatesFromMatches(
      [match({ matchId: 'b' })],
      11,
    )

    expect(zeroDamage[0]?.avgDamage).toBe(0)
    expect(missingDamage[0]?.avgDamage).toBeNull()
  })

  it('grade가 없으면 null이고 실제 gradeLabel이 있으면 사용', () => {
    const graded = {
      ...match({ matchId: 'a' }),
      gradeLabel: 'A · 참고',
    } satisfies MatchSummaryContract & { gradeLabel: string }

    expect(buildCharacterAggregatesFromMatches([match({ matchId: 'b' })], 11)[0]?.gradeLabel).toBeNull()
    expect(buildCharacterAggregatesFromMatches([graded], 11)[0]?.gradeLabel).toBe('A · 참고')
  })

  it('rpSeries는 랭크 match만 포함하고 중복 gameId와 rp 없는 match는 제외', () => {
    const points = buildRpSeriesFromMatches(
      [
        match({ matchId: 'rank-a', gameStartedAt: '2026-06-10T10:00:00+09:00', rpAfter: 8000 }),
        match({ matchId: 'rank-a', gameStartedAt: '2026-06-10T11:00:00+09:00', rpAfter: 8100 }),
        match({ matchId: 'rank-b', gameStartedAt: '2026-06-11T10:00:00+09:00' }),
        match({ matchId: 'normal-a', gameMode: 'normal', gameStartedAt: '2026-06-12T10:00:00+09:00', rpAfter: 8200 }),
        match({ matchId: 'rank-c', gameStartedAt: '2026-06-12T10:00:00+09:00', rpAfter: 8300 }),
      ],
      11,
    )

    expect(points).toHaveLength(2)
    expect(points.map((point) => point.rpAfter)).toEqual([8000, 8300])
  })

  it('rpSeries는 랭크가 있는 날짜 중 최신 7일만 반환', () => {
    const points = buildRpSeriesFromMatches(
      Array.from({ length: 12 }, (_, index) =>
        match({
          matchId: `rank-day-${index + 1}`,
          gameStartedAt: `2026-06-${String(index + 1).padStart(2, '0')}T10:00:00+09:00`,
          rpAfter: 8000 + index * 10,
        }),
      ),
      11,
    )

    expect(points).toHaveLength(7)
    expect(points.map((point) => point.dateLabel)).toEqual([
      '6. 6.',
      '6. 7.',
      '6. 8.',
      '6. 9.',
      '6. 10.',
      '6. 11.',
      '6. 12.',
    ])
    expect(points.map((point) => point.rpAfter)).toEqual([
      8050,
      8060,
      8070,
      8080,
      8090,
      8100,
      8110,
    ])
  })

  it('공식 stats와 rpSeries가 함께 있으면 mixed source ready', () => {
    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: [stat({ totalGames: 12, characterStats: [characterStat()] })],
      matches: Array.from({ length: 12 }, (_, index) =>
        match({
          matchId: `m${index + 1}`,
          gameStartedAt: `2026-06-${String(10 + (index % 3)).padStart(2, '0')}T10:00:00+09:00`,
          rpAfter: 8000 + index * 10,
        }),
      ),
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(built.source).toBe('mixed')
    expect(built.cacheStatus).toBe('ready')
    expect(built.characterStats[0]?.games).toBe(12)
    expect(built.rpSeries.length).toBeGreaterThanOrEqual(2)
  })

  it('matchCache가 apiSeasonId로 저장되어도 displaySeason aggregate에 포함', () => {
    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: null,
      matches: [
        match({
          matchId: 'api-season-a',
          seasonNumber: 39,
          gameStartedAt: '2026-06-10T10:00:00+09:00',
          rpAfter: 8000,
          teamKills: 10,
          damageToPlayers: 12000,
        }),
        match({
          matchId: 'api-season-b',
          seasonNumber: 39,
          gameStartedAt: '2026-06-11T10:00:00+09:00',
          rpAfter: 8100,
          kills: 5,
          assists: 4,
          deaths: 1,
          teamKills: 12,
          damageToPlayers: 16000,
        }),
      ],
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(built.cacheStatus).toBe('ready')
    expect(built.rpSeries).toHaveLength(2)
    expect(built.characterStats[0]).toMatchObject({
      kda: 7,
      avgTeamKills: 11,
      avgKills: 4,
      avgDamage: 14000,
    })
  })

  it('공식 stats 캐릭터 이름은 비랭크 matchCache 메타데이터로도 보강', () => {
    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: [
        stat({
          characterStats: [
            characterStat({ characterCode: 56, totalGames: 19, wins: 7 }),
          ],
        }),
      ],
      matches: [
        match({
          matchId: 'normal-name-source',
          characterNum: 56,
          characterName: '샬럿',
          gameMode: 'normal',
        }),
      ],
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(built.characterStats[0]).toMatchObject({
      characterNum: 56,
      characterName: '샬럿',
    })
  })

  it('공식 stats 캐릭터와 matchCache 추가 캐릭터를 중복 없이 merge', () => {
    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: [
        stat({
          totalGames: 100,
          characterStats: [
            characterStat({ characterCode: 1, totalGames: 20, wins: 8 }),
            characterStat({ characterCode: 2, totalGames: 10, wins: 2 }),
            characterStat({ characterCode: 3, totalGames: 5, wins: 1 }),
          ],
        }),
      ],
      matches: [
        match({ matchId: 'a', characterNum: 1, characterName: '유키', kills: 5, assists: 2, deaths: 1, damageToPlayers: 13000 }),
        match({ matchId: 'b', characterNum: 4, characterName: '피오라', kills: 2, assists: 4, deaths: 2, damageToPlayers: 9000 }),
      ],
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(built.source).toBe('mixed')
    expect(built.characterStats.map((row) => row.characterNum).sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    expect(built.characterStats.find((row) => row.characterNum === 1)).toMatchObject({
      games: 20,
      wins: 8,
      kda: 7,
      avgDamage: 13000,
    })
  })

  it('공식 stats 총게임보다 캐릭터 커버리지가 부족하면 partial', () => {
    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: [
        stat({
          totalGames: 20,
          characterStats: [characterStat({ totalGames: 12 })],
        }),
      ],
      matches: [
        match({ matchId: 'a', gameStartedAt: '2026-06-10T10:00:00+09:00', rpAfter: 8000 }),
        match({ matchId: 'b', gameStartedAt: '2026-06-11T10:00:00+09:00', rpAfter: 8100 }),
      ],
    })

    expect(built.cacheStatus).toBe('partial')
  })

  it('공식 시즌 판수와 수집된 랭크 경기 수 coverage를 반환', () => {
    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: [
        stat({
          totalGames: 20,
          characterStats: [characterStat({ totalGames: 12 })],
        }),
      ],
      matches: [
        match({ matchId: 'rank-a', seasonNumber: 39, rpAfter: 8000 }),
        match({ matchId: 'rank-b', seasonNumber: 11, rpAfter: 8100 }),
        match({ matchId: 'normal-a', gameMode: 'normal', seasonNumber: 39, rpAfter: 8200 }),
        match({ matchId: 'old-season', seasonNumber: 10, rpAfter: 8300 }),
      ],
    })

    expect(built.coverage).toEqual({
      officialSeasonGames: 20,
      collectedGames: 2,
      characterCount: built.characterStats.length,
      rpPointCount: built.rpSeries.length,
      coverageRatio: 0.1,
    })
  })

  it('같은 characterNum은 officialStats 기준 값을 우선 사용', () => {
    const official = {
      ...characterStat({ characterCode: 1, totalGames: 30, wins: 15 }),
      kills: 100,
      assists: 50,
      deaths: 25,
      kda: 6,
      avgKills: 3.33,
      avgTeamKills: 8,
      avgDamage: 15000,
      gradeLabel: 'A',
    } satisfies BserCharacterStat & {
      kills: number
      assists: number
      deaths: number
      kda: number
      avgKills: number
      avgTeamKills: number
      avgDamage: number
      gradeLabel: string
    }

    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: [stat({ characterStats: [official] })],
      matches: [
        match({ matchId: 'a', characterNum: 1, kills: 1, assists: 1, deaths: 1, teamKills: 2, damageToPlayers: 1000 }),
      ],
    })

    expect(built.characterStats[0]).toMatchObject({
      games: 30,
      wins: 15,
      kills: 100,
      assists: 50,
      deaths: 25,
      kda: 6,
      avgTeamKills: 8,
      avgKills: 3.33,
      avgDamage: 15000,
      gradeLabel: 'A',
    })
  })

  it('rpAfter가 없어도 대체 RP 필드가 있으면 rpSeries 생성', () => {
    const alternateRp = {
      ...match({ matchId: 'rank-a', gameStartedAt: '2026-06-10T10:00:00+09:00' }),
      rankPoint: 8123,
      rankPointGain: 23,
    } satisfies MatchSummaryContract & { rankPoint: number; rankPointGain: number }

    const points = buildRpSeriesFromMatches([alternateRp], 11)

    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({
      rpAfter: 8123,
      rpDelta: 23,
    })
  })

  it('부족하면 partial 상태로 반환', () => {
    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: null,
      matches: [match({ matchId: 'a', rpAfter: 8000 })],
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(built.source).toBe('matchCache')
    expect(built.cacheStatus).toBe('partial')
  })

  it('normalizeCoverageCollectedGames는 DB rank count로 collectedGames 하한을 유지', () => {
    const coverage = buildSeasonAggregateCoverage({
      stats: [stat({ totalGames: 797 })],
      matches: [],
      displaySeasonId: 11,
      apiSeasonId: 39,
      characterCount: 3,
      rpPointCount: 10,
    })

    expect(coverage.collectedGames).toBe(0)

    const normalized = normalizeCoverageCollectedGames(coverage, 784)

    expect(normalized.collectedGames).toBe(784)
    expect(normalized.coverageRatio).toBeCloseTo(784 / 797, 2)
  })

  it('buildSeasonAggregate는 rankGameCount로 coverage collectedGames 하한 적용', () => {
    const built = buildSeasonAggregate({
      uid: '123456',
      apiSeasonId: 39,
      displaySeasonId: 11,
      stats: [stat({ totalGames: 797 })],
      matches: [],
      rankGameCount: 784,
      now: new Date('2026-06-13T00:00:00.000Z'),
    })

    expect(built.coverage?.collectedGames).toBe(784)
  })
})
