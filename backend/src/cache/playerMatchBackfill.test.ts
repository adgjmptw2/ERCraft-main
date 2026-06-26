import { describe, expect, it } from 'vitest'

import {
  clearFullBackfillStateForTests,
  snapshotFullBackfillProgress,
} from './playerMatchBackfill.js'

describe('snapshotFullBackfillProgress', () => {
  it('rank count가 official과 같으면 complete', () => {
    expect(
      snapshotFullBackfillProgress({
        uid: 'uid-1',
        apiSeasonId: 39,
        rankCount: 48,
        officialSeasonGames: 48,
      }).status,
    ).toBe('complete')
  })

  it('rank count가 0이고 inflight 없으면 idle', () => {
    clearFullBackfillStateForTests()
    expect(
      snapshotFullBackfillProgress({
        uid: 'uid-3',
        apiSeasonId: 39,
        rankCount: 0,
        officialSeasonGames: 48,
      }).status,
    ).toBe('idle')
  })

  it('rank count가 부족하면 partial', () => {
    clearFullBackfillStateForTests()
    expect(
      snapshotFullBackfillProgress({
        uid: 'uid-4',
        apiSeasonId: 39,
        rankCount: 10,
        officialSeasonGames: 48,
      }).status,
    ).toBe('partial')
  })
})
