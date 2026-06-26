import { describe, expect, it } from 'vitest'

import {
  buildRoleMetricsUpdatePayload,
  dedupeGamePlans,
  isGameAlreadyProcessed,
  mergeCheckpoint,
  parseBackfillCliArgs,
  pickParticipantForRow,
} from './roleMetricsBackfill.js'

describe('roleMetricsBackfill', () => {
  it('CLI 파싱', () => {
    expect(parseBackfillCliArgs([]).dryRun).toBe(true)
    const options = parseBackfillCliArgs([
      '--execute',
      '--max-games=20',
      '--resume',
      '--character-num=73',
      '--weapon-type-id=24',
    ])
    expect(options.dryRun).toBe(false)
    expect(options.maxGames).toBe(20)
    expect(options.resume).toBe(true)
    expect(options.characterNum).toBe(73)
    expect(options.weaponTypeId).toBe(24)
    expect(parseBackfillCliArgs(['--execute', '--strategy=balanced']).strategy).toBe('balanced')
  })

  it('unique gameId dedupe', () => {
    const selected = dedupeGamePlans(
      [
        { gameId: 'a', rowCount: 2 },
        { gameId: 'a', rowCount: 1 },
        { gameId: 'b', rowCount: 3 },
      ],
      10,
    )
    expect(selected.map((plan) => plan.gameId)).toEqual(['a', 'b'])
  })

  it('한 game 응답에서 uid/조합으로 참가자 선택', () => {
    const row = pickParticipantForRow(
      [
        {
          gameId: 1,
          seasonId: 1,
          matchingMode: 3,
          matchingTeamMode: 1,
          characterNum: 73,
          characterLevel: 1,
          gameRank: 1,
          playerKill: 0,
          playerAssistant: 0,
          monsterKill: 0,
          victory: 0,
          startDtm: '2026-01-01T00:00:00Z',
          uid: 'uid-b',
          bestWeapon: 24,
          damageFromPlayer: 900,
        },
      ],
      { uid: 'uid-b', characterNum: 73, weaponTypeId: 24 },
    )
    expect(row?.damageFromPlayer).toBe(900)
  })

  it('checkpoint resume', () => {
    const checkpoint = mergeCheckpoint(
      { processedGameIds: ['g1'], failedGameIds: [], updatedAt: '2026-01-01' },
      true,
    )
    expect(isGameAlreadyProcessed('g1', checkpoint)).toBe(true)
    expect(isGameAlreadyProcessed('g2', checkpoint)).toBe(false)
  })

  it('buildRoleMetricsUpdatePayload', () => {
    const payload = buildRoleMetricsUpdatePayload({
      gameId: 1,
      seasonId: 1,
      matchingMode: 3,
      matchingTeamMode: 1,
      characterNum: 30,
      characterLevel: 1,
      gameRank: 1,
      playerKill: 0,
      playerAssistant: 0,
      monsterKill: 2,
      victory: 0,
      startDtm: '2026-01-01T00:00:00Z',
      damageFromPlayer: 1000,
      protectAbsorb: 0,
      teamRecover: 0,
      ccTimeToPlayer: 12.5,
      viewContribution: 4,
    })
    expect(payload?.roleMetricsVersion).toBe(1)
    expect(payload?.damageFromPlayer).toBe(1000)
    expect(payload?.ccTimeToPlayer).toBe(12.5)
  })
})
