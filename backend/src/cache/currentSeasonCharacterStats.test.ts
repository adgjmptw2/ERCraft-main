import { describe, expect, it } from 'vitest'

import { buildCurrentSeasonCharacterStatsFromPlayerMatches } from './currentSeasonCharacterStats.js'

function createPrismaMock(rows: Array<Record<string, unknown>>) {
  return {
    playerMatch: {
      findMany: async () => rows,
      upsert: async () => ({}),
      count: async () => rows.length,
    },
  } as never
}

describe('buildCurrentSeasonCharacterStatsFromPlayerMatches', () => {
  it('PlayerMatch rank rows를 character stats로 집계', async () => {
    const prisma = createPrismaMock([
      {
        gameId: 'g1',
        characterNum: 1,
        characterName: '재키',
        placement: 3,
        kills: 4,
        deaths: 1,
        assists: 2,
        teamKills: 8,
        damageToPlayer: 12000,
        victory: true,
        playedAt: new Date('2026-06-01T10:00:00.000Z'),
        gameMode: 'rank',
        apiSeasonId: 39,
        displaySeasonId: 11,
      },
      {
        gameId: 'g2',
        characterNum: 17,
        characterName: '히야',
        placement: 5,
        kills: 2,
        deaths: 2,
        assists: 3,
        teamKills: 6,
        damageToPlayer: 9000,
        victory: false,
        playedAt: new Date('2026-06-02T10:00:00.000Z'),
        gameMode: 'rank',
        apiSeasonId: 39,
        displaySeasonId: 11,
      },
      {
        gameId: 'g3',
        characterNum: 19,
        characterName: '엠마',
        placement: 2,
        kills: 5,
        deaths: 0,
        assists: 1,
        teamKills: 10,
        damageToPlayer: 15000,
        victory: true,
        playedAt: new Date('2026-06-03T10:00:00.000Z'),
        gameMode: 'rank',
        apiSeasonId: 39,
        displaySeasonId: 11,
      },
      {
        gameId: 'g4',
        characterNum: 11,
        characterName: '마이',
        placement: 4,
        kills: 3,
        deaths: 1,
        assists: 4,
        teamKills: 7,
        damageToPlayer: 11000,
        victory: false,
        playedAt: new Date('2026-06-04T10:00:00.000Z'),
        gameMode: 'rank',
        apiSeasonId: 39,
        displaySeasonId: 11,
      },
    ])

    const stats = await buildCurrentSeasonCharacterStatsFromPlayerMatches(prisma, {
      uid: 'uid-1',
      apiSeasonId: 39,
      displaySeasonId: 11,
    })

    expect(stats).toHaveLength(4)
    expect(stats.every((row) => row.kda !== null && row.avgKills !== null)).toBe(true)
    expect(stats.find((row) => row.characterNum === 19)?.kda).toBe(6)
  })
})
