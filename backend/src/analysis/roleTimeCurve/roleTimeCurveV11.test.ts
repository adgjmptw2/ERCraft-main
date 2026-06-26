import { describe, expect, it } from 'vitest'

import type { RoleTimePlayerMatchRow } from './roleTimeCurve.js'
import {
  auditDurationMeaning,
  buildHoldoutValidation,
  buildRoleTimeCurveCandidateV11,
} from './roleTimeCurveV11.js'

function row(partial: Partial<RoleTimePlayerMatchRow>): RoleTimePlayerMatchRow {
  return {
    uid: partial.uid ?? 'uid-a',
    gameId: partial.gameId ?? 'game-a',
    apiSeasonId: partial.apiSeasonId ?? 39,
    displaySeasonId: partial.displaySeasonId ?? 11,
    gameMode: partial.gameMode ?? 'rank',
    playedAt: partial.playedAt ?? new Date('2026-06-01T00:00:00.000Z'),
    characterNum: partial.characterNum ?? 1,
    bestWeapon: partial.bestWeapon ?? null,
    placement: partial.placement ?? 1,
    deaths: partial.deaths ?? 0,
    victory: partial.victory ?? false,
    rpAfter: partial.rpAfter ?? 1000,
    gameDuration: partial.gameDuration ?? 18 * 60,
    damageToPlayer: partial.damageToPlayer ?? 1000,
    viewContribution: partial.viewContribution ?? 10,
    monsterKill: partial.monsterKill ?? 20,
  }
}

describe('role-time-curve v1.1 candidate', () => {
  it('detects gameDuration differences within the same game fixture', () => {
    const audit = auditDurationMeaning([
      row({ gameId: 'same', uid: 'u1', victory: true, placement: 1, gameDuration: 1200 }),
      row({ gameId: 'same', uid: 'u2', victory: false, placement: 8, gameDuration: 600 }),
    ], 'fixed')
    expect(audit.dbComparison.differentDurationGroups).toBe(1)
    expect(audit.dbComparison.winLossDifferentDurationGroups).toBe(1)
    expect(audit.conclusion).toBe('participant-or-team-activity-time-like')
  })

  it('uses anchor-level shrinkage and global fallback for zero-sample anchors', () => {
    const candidate = buildRoleTimeCurveCandidateV11([
      row({ uid: 'global', gameId: 'g1', gameDuration: 18 * 60, damageToPlayer: 1800 }),
      row({ uid: 'global2', gameId: 'g2', gameDuration: 23 * 60, damageToPlayer: 2300 }),
    ], { generatedAt: 'fixed', anchorShrinkK: 30 })
    const assassin = candidate.curves['암살자'].damageToPlayer.points.find((point) => point.minute === 10)
    expect(assassin?.source).toBe('global-fallback')
    expect(assassin?.anchorWeight).toBe(0)
  })

  it('marks 30m zero-sample handling as extrapolated and keeps monotonic values', () => {
    const candidate = buildRoleTimeCurveCandidateV11([
      row({ gameId: 'g1', gameDuration: 18 * 60, damageToPlayer: 1800 }),
      row({ gameId: 'g2', gameDuration: 23 * 60, damageToPlayer: 2300 }),
    ], { generatedAt: 'fixed', anchorShrinkK: 30 })
    const points = candidate.curves.unknown.damageToPlayer.points
    for (let index = 1; index < points.length; index += 1) {
      expect(points[index]!.absoluteExpectedValue).toBeGreaterThanOrEqual(points[index - 1]!.absoluteExpectedValue)
    }
    expect(points.find((point) => point.minute === 30)?.source).toBe('extrapolated')
  })

  it('keeps normalized multiplier average near 1 for finite training rows', () => {
    const rows = [
      row({ gameId: 'g1', gameDuration: 12 * 60, damageToPlayer: 1200 }),
      row({ gameId: 'g2', gameDuration: 18 * 60, damageToPlayer: 1800 }),
      row({ gameId: 'g3', gameDuration: 24 * 60, damageToPlayer: 2400 }),
    ]
    const candidate = buildRoleTimeCurveCandidateV11(rows, { generatedAt: 'fixed', anchorShrinkK: 30 })
    const curve = candidate.curves.unknown.damageToPlayer
    const meanMultiplier = curve.points.reduce((sum, point) => sum + point.normalizedMultiplier, 0) / curve.points.length
    expect(Number.isFinite(meanMultiplier)).toBe(true)
    expect(meanMultiplier).toBeGreaterThan(0)
  })

  it('splits holdout by gameId with no shared gameIds', () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      row({
        uid: `uid-${index % 4}`,
        gameId: `game-${index}`,
        gameDuration: (10 + (index % 15)) * 60,
        damageToPlayer: 1000 + index * 100,
      }),
    )
    const report = buildHoldoutValidation(rows, 'fixed')
    expect(report.split.validationRows).toBeGreaterThan(0)
    expect(report.split.sharedGameIds).toBe(0)
  })

  it('does not output NaN or Infinity', () => {
    const candidate = buildRoleTimeCurveCandidateV11([row({ gameId: 'g1' })], {
      generatedAt: 'fixed',
      anchorShrinkK: 30,
    })
    const text = JSON.stringify(candidate)
    expect(text).not.toContain('NaN')
    expect(text).not.toContain('Infinity')
    expect(candidate.runtimeApplied).toBe(false)
  })
})

