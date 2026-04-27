// BSER API 응답 → Contract 타입 변환 책임.
// 프론트 src/types를 직접 import하지 않음.
// backend/src/contracts/player.ts의 Contract 타입 사용.
// Contract 타입은 프론트 타입과 같은 shape를 유지하므로 프론트에서 그대로 사용 가능.

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
