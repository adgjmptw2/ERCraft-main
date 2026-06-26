import type { PlayerSeasonsContract } from '../contracts/season.js'

export function withSeasonsOwnerMetadata(
  body: PlayerSeasonsContract,
  owner: { nickname: string; userNum: number },
  from: number,
  to: number,
  currentSeason: number,
  source?: { count: number; strategy: 'canonical' | 'verified-alias' },
): PlayerSeasonsContract {
  const status: 'complete' | 'partial' =
    from === to && to === currentSeason ? 'partial' : 'complete'
  return {
    ...body,
    owner,
    ...(source ? { source } : {}),
    requestedRange: { from, to },
    status,
  }
}
