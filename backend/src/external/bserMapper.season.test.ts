import { describe, expect, it } from 'vitest'

import {
  hasPlacement,
  mapToPlayerSummary,
  mapToSeasonRecord,
  mapToMatchSummary,
  mmrToSeasonRank,
  resolveLeaderboardRank,
} from '../external/bserMapper.js'

describe('bserMapper season', () => {
  it('mmrToSeasonRank — 플래티넘 구간', () => {
    const rank = mmrToSeasonRank(3600)
    expect(rank.tier).toBe('플래티넘')
    expect(rank.rp).toBe(3600)
  })

  it('mmrToSeasonRank — 미스릴', () => {
    const rank = mmrToSeasonRank(8833)
    expect(rank.tier).toBe('미스릴')
    expect(rank.rp).toBe(8833)
  })

  it('mapToSeasonRecord — 무전적 시즌', () => {
    const record = mapToSeasonRecord(3, null, [])
    expect(record.played).toBe(false)
    expect(record.tier).toBe('—')
    expect(record.games).toBe(0)
  })

  it('mapToSeasonRecord — 스쿼드 랭크 통계', () => {
    const record = mapToSeasonRecord(11, { mmr: 8833, nickname: '절단마술사', rank: 120 }, [
      {
        seasonId: 11,
        matchingMode: 3,
        matchingTeamMode: 3,
        mmr: 8833,
        nickname: '절단마술사',
        rank: 120,
        rankSize: 1000,
        totalGames: 280,
        totalWins: 90,
        totalTeamKills: 0,
        totalDeaths: 190,
        averageRank: 4.2,
        averageKills: 4.1,
        averageAssistants: 3.2,
        top1: 0.1,
        top3: 0.35,
      },
    ])
    expect(record.played).toBe(true)
    expect(record.games).toBe(280)
    expect(record.wins).toBe(90)
    expect(record.seasonNumber).toBe(11)
    expect(record.rank.rank).toBe(120)
  })

  it('mapToSeasonRecord — 표시 RP는 stats mmr, 순위는 rank API', () => {
    const record = mapToSeasonRecord(
      11,
      { mmr: 7324, nickname: '찬형', rank: 4207 },
      [
        {
          seasonId: 39,
          matchingMode: 3,
          matchingTeamMode: 3,
          mmr: 8024,
          nickname: '찬형',
          rank: 740,
          rankSize: 1000,
          totalGames: 55,
          totalWins: 16,
          totalTeamKills: 0,
          totalDeaths: 39,
          averageRank: 3.6,
          averageKills: 4,
          averageAssistants: 3,
          top1: 0.1,
          top3: 0.5,
        },
      ],
    )
    expect(record.rank.rp).toBe(8024)
    expect(record.rank.rank).toBe(4207)
    expect(record.tier).toBe('미스릴')
  })

  it('mmrToSeasonRank — 미스릴 이상은 리더보드 순위를 표시한다', () => {
    const rank = mmrToSeasonRank(8329, 1418, 11)
    expect(rank.tier).toBe('미스릴')
    expect(rank.rank).toBe(1418)
  })

  it('resolveLeaderboardRank — rank API 필드 우선', () => {
    expect(resolveLeaderboardRank({ mmr: 1, nickname: 'a', rank: 4207, serverRank: 4995 })).toBe(4207)
    expect(resolveLeaderboardRank({ mmr: 1, nickname: 'a', rank: 0, serverRank: 4995 })).toBe(4995)
  })

  it('이월 MMR(rank=0)은 플레이한 시즌으로 치지 않는다', () => {
    // BSER은 배치 미완료 시즌에도 직전 시즌 mmr을 그대로 돌려준다
    const record = mapToSeasonRecord(
      6,
      { mmr: 7142, nickname: '하잉', rank: 0, serverRank: 0 },
      [],
    )
    expect(record.played).toBe(false)
    expect(record.tier).toBe('—')
  })

  it('배치 완료(rank>0) 시즌은 played=true에 실제 RP', () => {
    const record = mapToSeasonRecord(
      10,
      { mmr: 7633, nickname: '하잉', rank: 6643, serverRank: 6375 },
      [],
    )
    expect(record.played).toBe(true)
    expect(record.rank.rp).toBe(7633)
    expect(record.tier).toBe('미스릴')
  })

  it('mmrToSeasonRank — mmr 0이면 언랭크', () => {
    expect(mmrToSeasonRank(0).tier).toBe('언랭크')
  })

  it('hasPlacement — rank/serverRank 모두 0이면 false', () => {
    expect(hasPlacement({ mmr: 4650, nickname: '하잉', rank: 0, serverRank: 0 })).toBe(false)
    expect(hasPlacement({ mmr: 7633, nickname: '하잉', rank: 6643 })).toBe(true)
    expect(hasPlacement(null)).toBe(false)
  })

  it('mapToPlayerSummary — 배치 미완료면 Unranked', () => {
    const user = { uid: 'abc123', nickname: '하잉' }
    const unplaced = mapToPlayerSummary(user, { mmr: 4650, nickname: '하잉', rank: 0 }, 197)
    expect(unplaced.tier).toBe('언랭크')

    const placed = mapToPlayerSummary(user, { mmr: 4650, nickname: '하잉', rank: 1234 }, 197)
    expect(placed.tier).not.toBe('언랭크')
  })

  it('mapToPlayerSummary — stats mmr이 표시 RP', () => {
    const user = { uid: 'abc123', nickname: '찬형' }
    const summary = mapToPlayerSummary(
      user,
      { mmr: 7324, nickname: '찬형', rank: 4207 },
      316,
      [
        {
          seasonId: 39,
          matchingMode: 3,
          matchingTeamMode: 3,
          mmr: 8024,
          nickname: '찬형',
          rank: 740,
          rankSize: 1000,
          totalGames: 55,
          totalWins: 16,
          totalTeamKills: 0,
          totalDeaths: 39,
          averageRank: 3.6,
          averageKills: 4,
          averageAssistants: 3,
          top1: 0.1,
          top3: 0.5,
        },
      ],
    )
    expect(summary.rp).toBe(8024)
    expect(summary.leaderboardRank).toBe(4207)
    expect(summary.tier).toBe('미스릴')
  })

  it('mapToPlayerSummary — accountLevel 없으면 Lv.1로 fallback하지 않음', () => {
    const summary = mapToPlayerSummary(
      { uid: 'abc123', nickname: '하잉' },
      { mmr: 4650, nickname: '하잉', rank: 1234 },
    )

    expect(summary.level).toBeNull()
  })

  it('mapToMatchSummary — accountLevel을 match 계약에 보존', () => {
    const match = mapToMatchSummary(
      'abc123',
      {
        gameId: 1,
        seasonId: 39,
        matchingMode: 3,
        matchingTeamMode: 3,
        characterNum: 1,
        characterLevel: 17,
        gameRank: 2,
        playerKill: 3,
        playerDeaths: 0,
        playerAssistant: 4,
        monsterKill: 8,
        victory: 0,
        startDtm: '2026-06-10T10:00:00+09:00',
        accountLevel: 394,
      },
      new Map([[1, '재키']]),
    )

    expect(match.accountLevel).toBe(394)
    expect(match.characterLevel).toBe(17)
  })

  it('mapToMatchSummary — 대체 RP/딜량/등급 필드를 계약에 보존', () => {
    const match = mapToMatchSummary(
      'abc123',
      {
        gameId: 2,
        seasonId: 39,
        matchingMode: 3,
        matchingTeamMode: 3,
        characterNum: 1,
        characterLevel: 17,
        gameRank: 2,
        playerKill: 3,
        playerDeaths: 0,
        playerAssistant: 4,
        monsterKill: 8,
        victory: 0,
        startDtm: '2026-06-10T10:00:00+09:00',
        rankPoint: 8123,
        rankPointGain: 23,
        playerDamage: 15000,
        teamKills: 9,
        matchGrade: 'A',
      },
      new Map([[1, '재키']]),
    )

    expect(match.rpAfter).toBe(8123)
    expect(match.rpDelta).toBe(23)
    expect(match.damageToPlayers).toBe(15000)
    expect(match.playerDamage).toBe(15000)
    expect(match.teamKills).toBe(9)
    expect(match.gradeLabel).toBe('A')
  })

  it('mapToMatchSummary — cobalt traitSecondSub 장착 인퓨전 우선', () => {
    const match = mapToMatchSummary(
      'uid-a',
      {
        gameId: 61946355,
        seasonId: 39,
        matchingMode: 6,
        matchingTeamMode: 3,
        characterNum: 78,
        characterLevel: 10,
        gameRank: 1,
        playerKill: 1,
        playerAssistant: 0,
        monsterKill: 0,
        victory: 1,
        startDtm: '2026-06-01T00:00:00Z',
        finalInfusion: [64, 62, 78],
        traitSecondSub: [7922602, 7922402, 7923602],
      },
      new Map([[78, '영타이거']]),
    )

    expect(match.gameMode).toBe('cobalt')
    expect(match.cobaltInfusions).toEqual([7922602, 7922402])
  })

  it('mapToMatchSummary — cobalt FinalInfusion → cobaltInfusions (traitSecondSub 없을 때)', () => {
    const match = mapToMatchSummary(
      'uid-a',
      {
        gameId: 99,
        seasonId: 39,
        matchingMode: 6,
        matchingTeamMode: 3,
        characterNum: 1,
        characterLevel: 10,
        gameRank: 1,
        playerKill: 1,
        playerAssistant: 0,
        monsterKill: 0,
        victory: 1,
        startDtm: '2026-06-01T00:00:00Z',
        finalInfusion: [7000201, 7000401, 7000501],
      },
      new Map([[1, '유키']]),
    )

    expect(match.gameMode).toBe('cobalt')
    expect(match.cobaltInfusions).toEqual([7000201, 7000401, 7000501])
  })

  it('matchingMode 2 + finalInfusion 없으면 normal', () => {
    const match = mapToMatchSummary(
      'uid-a',
      {
        gameId: 101,
        seasonId: 39,
        matchingMode: 2,
        matchingTeamMode: 3,
        characterNum: 1,
        characterLevel: 10,
        gameRank: 1,
        playerKill: 1,
        playerAssistant: 0,
        monsterKill: 0,
        victory: 1,
        startDtm: '2026-06-01T00:00:00Z',
        finalInfusion: [7000201],
      },
      new Map([[1, '유키']]),
    )

    expect(match.gameMode).toBe('cobalt')
    expect(match.cobaltInfusions).toEqual([7000201])
  })

  it('mapToMatchSummary — rank 게임은 cobaltInfusions 없음', () => {
    const match = mapToMatchSummary(
      'uid-a',
      {
        gameId: 100,
        seasonId: 39,
        matchingMode: 3,
        matchingTeamMode: 3,
        characterNum: 1,
        characterLevel: 10,
        gameRank: 1,
        playerKill: 1,
        playerAssistant: 0,
        monsterKill: 0,
        victory: 1,
        startDtm: '2026-06-01T00:00:00Z',
        finalInfusion: [7000201],
      },
      new Map([[1, '유키']]),
    )

    expect(match.gameMode).toBe('rank')
    expect(match.cobaltInfusions).toBeUndefined()
  })
})
