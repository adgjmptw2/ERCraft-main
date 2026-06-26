import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./characterPerformanceGrade/compute.js', () => ({
  computeMatchPerformanceGrade: vi.fn(
    ({ row }: { row: { kills?: number | null; placement?: number | null } }) => {
    const roleScores = new Map<number, number>([
      [1, 90],
      [3, 40],
      [2, 60],
      [8, 95],
    ])
    const roleScore = row.kills == null ? null : roleScores.get(row.kills) ?? null
    const outcomeBonus = row.placement === 1 ? 35 : row.placement === 2 ? 20 : 0
    const score = roleScore == null ? null : Math.min(100, roleScore + outcomeBonus)
      return {
        matchGrade: score == null ? null : 'B',
        matchGradeScore: score,
        matchGradeBaselineTierKey: score == null ? null : 'gold',
        matchGradeRole: null,
        matchGradeUsedFallback: false,
        matchGradeFallback: undefined,
        matchGradeOutcomeScore: null,
        matchGradeRoleScore: roleScore,
      }
    },
  ),
}))

vi.mock('./characterPerformanceGrade/baselineStore.js', () => ({
  lookupBaselineMetricsAtTier: vi.fn(() => ({
    count: 100,
    winRate: 0.5,
    top3Rate: 0.5,
    averagePlace: 4,
    averagePlayerKill: 2,
    averagePlayerAssistant: 2,
    averageTeamKill: 5,
    averageDeaths: 1,
    averageDamageToPlayer: 10000,
    averageViewContribution: 0,
    averageMonsterKill: 0,
  })),
  lookupCharacterWeaponRole: vi.fn(() => '스증 딜러'),
}))

vi.mock('./characterPerformanceGrade/tierKey.js', () => ({
  rankTierToGradeBaselineKey: vi.fn(() => 'meteorite_plus'),
}))

import { computeMatchPerformanceGrade } from './characterPerformanceGrade/compute.js'
import {
  clearTeamPerformanceCache,
  computeTeamPerformanceForMatch,
  summarizeTeamPerformance,
  teamPerformanceCacheSize,
  type TeamPerformanceParticipantRow,
} from './teamPerformance.js'

const baseParticipants: TeamPerformanceParticipantRow[] = [
  {
    gameId: 'match-1',
    uid: 'owner',
    teamNumber: 7,
    placement: 1,
    characterNum: 15,
    kills: 1,
    deaths: 1,
    assists: 2,
    teamKills: 5,
    damageToPlayer: 12000,
    rpAfter: 3000,
    bestWeapon: 6,
    gameDuration: 1000,
  },
  {
    gameId: 'match-1',
    uid: 'mate-a',
    teamNumber: 7,
    placement: 1,
    characterNum: 15,
    kills: 3,
    deaths: 1,
    assists: 4,
    teamKills: 5,
    damageToPlayer: 22000,
    rpAfter: 3100,
    bestWeapon: 6,
    gameDuration: 1000,
  },
  {
    gameId: 'match-1',
    uid: 'mate-b',
    teamNumber: 7,
    placement: 1,
    characterNum: 15,
    kills: 2,
    deaths: 2,
    assists: 6,
    teamKills: 5,
    damageToPlayer: 14000,
    rpAfter: 3200,
    bestWeapon: 6,
    gameDuration: 1000,
  },
  {
    gameId: 'match-1',
    uid: 'opponent',
    teamNumber: 8,
    placement: 1,
    characterNum: 15,
    kills: 8,
    deaths: 0,
    assists: 6,
    teamKills: 14,
    damageToPlayer: 35000,
    rpAfter: 3300,
    bestWeapon: 6,
    gameDuration: 1000,
  },
]

function rankMatch(overrides = {}) {
  return {
    matchId: 'match-1',
    userNum: 1,
    characterName: 'Owner',
    placement: 1,
    kills: 1,
    deaths: 1,
    assists: 2,
    gameStartedAt: new Date('2026-06-21T00:00:00Z').toISOString(),
    victory: false,
    gameMode: 'rank' as const,
    matchGrade: 'A',
    matchGradeScore: 85,
    matchGradeRoleScore: 90,
    ...overrides,
  }
}

describe('teamPerformance', () => {
  beforeEach(() => {
    clearTeamPerformanceCache()
    vi.mocked(computeMatchPerformanceGrade).mockClear()
  })

  it('같은 경기·같은 팀의 팀원만 평균에 사용하고 자기 자신과 상대 팀을 제외한다', () => {
    const result = computeTeamPerformanceForMatch({
      match: rankMatch(),
      ownerUid: 'owner',
      participants: baseParticipants,
      displaySeasonId: 11,
    })

    expect(result).toMatchObject({
      status: 'ready',
      teammateCount: 2,
      gradedTeammateCount: 2,
      ownPerformanceScore: -1.93,
      teammatePerformanceScore: 14.87,
      teammatePerformanceDelta: 14.87,
      teammatePerformanceLabel: '최상',
      carryBurdenDelta: -16.8,
      carryBurdenLabel: '팀원 성과 우세',
      teamLuckResidual: 14.87,
      fallbackLevel: null,
      confidence: 'high',
    })
    expect(computeMatchPerformanceGrade).not.toHaveBeenCalled()
  })

  it('팀이 1등이어도 팀운은 최종 점수가 아니라 팀원 보정 기여도 평균을 사용한다', () => {
    const result = computeTeamPerformanceForMatch({
      match: rankMatch({ placement: 1, victory: true, matchGradeScore: 99, matchGradeRoleScore: 45 }),
      ownerUid: 'owner',
      participants: baseParticipants.map((participant) => ({ ...participant, placement: 1 })),
      displaySeasonId: 11,
    })

    expect(result?.status).toBe('ready')
    expect(result?.teammatePerformanceScore).toBe(14.87)
    expect(result?.teammatePerformanceLabel).toBe('최상')
    expect(result?.ownPerformanceScore).toBe(-1.93)
    expect(result?.carryBurdenDelta).toBe(-16.8)
  })

  it('팀운은 역할별 순위 효과를 제거한 adjusted contribution을 사용한다', () => {
    const firstPlace = computeTeamPerformanceForMatch({
      match: rankMatch({ matchId: 'match-place-1', placement: 1, matchGradeRoleScore: 55 }),
      ownerUid: 'owner',
      participants: baseParticipants.map((participant) => ({
        ...participant,
        gameId: 'match-place-1',
        placement: 1,
      })),
      displaySeasonId: 11,
    })
    clearTeamPerformanceCache()
    const eighthPlace = computeTeamPerformanceForMatch({
      match: rankMatch({ matchId: 'match-place-8', placement: 8, matchGradeRoleScore: 55 }),
      ownerUid: 'owner',
      participants: baseParticipants.map((participant) => ({
        ...participant,
        gameId: 'match-place-8',
        placement: 8,
      })),
      displaySeasonId: 11,
    })

    expect(firstPlace?.teammatePerformanceScore).not.toBeNull()
    expect(eighthPlace?.teammatePerformanceScore).not.toBeNull()
    expect(firstPlace?.fallbackLevel).toBeNull()
    expect(eighthPlace?.fallbackLevel).toBeNull()
  })

  it('팀원 한 명만 계산 가능하면 partial이며 누락값을 0으로 채우지 않는다', () => {
    const result = computeTeamPerformanceForMatch({
      match: rankMatch(),
      ownerUid: 'owner',
      participants: baseParticipants.map((participant) =>
        participant.uid === 'mate-b' ? { ...participant, rpAfter: null } : participant,
      ),
      displaySeasonId: 11,
    })

    expect(result?.status).toBe('partial')
    expect(result?.reason).toBe('partial-one-teammate')
    expect(result?.teammateCount).toBe(2)
    expect(result?.gradedTeammateCount).toBe(1)
    expect(result?.teammatePerformanceScore).toBe(20.25)
    expect(result?.carryBurdenDelta).toBeLessThan(0)
  })

  it('팀원 점수가 모두 없으면 unavailable이며 점수 필드는 null이다', () => {
    const result = computeTeamPerformanceForMatch({
      match: rankMatch(),
      ownerUid: 'owner',
      participants: baseParticipants.map((participant) =>
        participant.uid?.startsWith('mate') ? { ...participant, rpAfter: null } : participant,
      ),
      displaySeasonId: 11,
    })

    expect(result?.status).toBe('unavailable')
    expect(result?.reason).toBe('missing-grade-input')
    expect(result?.gradedTeammateCount).toBe(0)
    expect(result?.teammatePerformanceScore).toBeNull()
    expect(result?.carryBurdenDelta).toBeNull()
  })

  it('rank가 아닌 mode는 계산하지 않는다', () => {
    const cobalt = computeTeamPerformanceForMatch({
      match: rankMatch({ gameMode: 'cobalt', matchGradeScore: null }),
      ownerUid: 'owner',
      participants: baseParticipants,
      displaySeasonId: 11,
    })

    expect(cobalt).toBeUndefined()
    expect(computeMatchPerformanceGrade).not.toHaveBeenCalled()
  })

  it('participant uid가 없으면 요청 닉네임으로 자기 자신만 식별하고 팀은 teamNumber로 분리한다', () => {
    const rows = baseParticipants.map((participant) => ({
      ...participant,
      uid: null,
      nickname:
        participant.uid === 'owner'
          ? '연서'
          : participant.uid === 'opponent'
            ? '상대'
            : participant.uid,
    }))

    const result = computeTeamPerformanceForMatch({
      match: rankMatch(),
      ownerUid: 'owner',
      ownerNickname: '연서',
      participants: rows,
      displaySeasonId: 11,
    })

    expect(result?.status).toBe('ready')
    expect(result?.teammateCount).toBe(2)
    expect(result?.teammatePerformanceScore).toBe(14.87)
    expect(computeMatchPerformanceGrade).not.toHaveBeenCalled()
  })

  it('같은 참가자 점수는 캐시에 보관해 반복 계산을 피한다', () => {
    const params = {
      match: rankMatch(),
      ownerUid: 'owner',
      participants: baseParticipants,
      displaySeasonId: 11,
    }

    computeTeamPerformanceForMatch(params)
    computeTeamPerformanceForMatch(params)

    expect(computeMatchPerformanceGrade).not.toHaveBeenCalled()
    expect(teamPerformanceCacheSize()).toBe(3)
  })

  it('요약은 ready/partial 경기 평균을 사용하고 unavailable을 별도 집계한다', () => {
    const summary = summarizeTeamPerformance([
      { ...rankMatch(), teamPerformance: {
        status: 'ready',
        teammateCount: 2,
        gradedTeammateCount: 2,
        ownPerformanceScore: 75,
        teammatePerformanceScore: 45,
        teammatePerformanceDelta: -20,
        teammatePerformanceLabel: '매우 아쉬움',
        carryBurdenDelta: 30,
        carryBurdenLabel: '매우 높은 캐리 부담',
      } },
      { ...rankMatch({ matchId: 'match-2' }), teamPerformance: {
        status: 'partial',
        teammateCount: 2,
        gradedTeammateCount: 1,
        ownPerformanceScore: 70,
        teammatePerformanceScore: 60,
        teammatePerformanceDelta: -5,
        teammatePerformanceLabel: '보통',
        carryBurdenDelta: 10,
        carryBurdenLabel: '높은 캐리 부담',
      } },
    ])

    expect(summary).toEqual({
      sampleSize: 2,
      readyMatches: 1,
      partialMatches: 1,
      unavailableMatches: 0,
      averageTeammatePerformanceScore: 52.5,
      averageCarryBurdenDelta: 20,
      highCarryBurdenMatches: 2,
      lowTeammatePerformanceMatches: 0,
    })
  })
})
