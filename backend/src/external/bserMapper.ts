import type {
  MatchSummaryContract,
  PlayerStatsContract,
  PlayerSummaryContract,
} from '../contracts/player.js'

export function mapToPlayerSummary(_raw: unknown): PlayerSummaryContract {
  void _raw
  throw new Error('NOT_IMPLEMENTED: mapToPlayerSummary')
}

export function mapToPlayerStats(_raw: unknown): PlayerStatsContract {
  void _raw
  throw new Error('NOT_IMPLEMENTED: mapToPlayerStats')
}

export function mapToMatchSummary(_raw: unknown): MatchSummaryContract {
  void _raw
  throw new Error('NOT_IMPLEMENTED: mapToMatchSummary')
}
