// BSER 응답을 Contract 타입으로 바꾸는 곳.
// 프론트 src/types 직접 안 씀. contracts/player.ts만 씀.
// Contract 타입은 프론트 타입과 shape가 같아서 프론트에서 그대로 쓸 수 있음.

import type {
  MatchSummaryContract,
  PlayerStatsContract,
  PlayerSummaryContract,
} from '../contracts/player.js'

export function mapToPlayerSummary(_raw: unknown): PlayerSummaryContract {
  throw new Error('NOT_IMPLEMENTED: mapToPlayerSummary')
}

export function mapToPlayerStats(_raw: unknown): PlayerStatsContract {
  throw new Error('NOT_IMPLEMENTED: mapToPlayerStats')
}

export function mapToMatchSummary(_raw: unknown): MatchSummaryContract {
  throw new Error('NOT_IMPLEMENTED: mapToMatchSummary')
}
