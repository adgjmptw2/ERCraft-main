import type { PlayerStatsDTO, PlayerSummary } from '@/types/player'

import { resolveStatsPayloadUserNum } from '@/utils/profileOwnerGate'

export interface ProfileCacheWriteContext {
  refreshNavigationKey: string
  activeNavigationKey: string
  expectedUserNum?: number | null
  expectedNickname: string
}

export function canApplyProfileCacheWrite(ctx: ProfileCacheWriteContext): boolean {
  return ctx.refreshNavigationKey === ctx.activeNavigationKey
}

export function assertSummaryWriteIdentity(
  summary: PlayerSummary | null | undefined,
  ctx: ProfileCacheWriteContext,
): boolean {
  if (!canApplyProfileCacheWrite(ctx)) return false
  if (!summary) return false
  if (summary.nickname.trim().toLowerCase() !== ctx.expectedNickname.trim().toLowerCase()) {
    return false
  }
  if (
    ctx.expectedUserNum != null &&
    Number.isFinite(ctx.expectedUserNum) &&
    ctx.expectedUserNum > 0 &&
    summary.userNum !== ctx.expectedUserNum
  ) {
    return false
  }
  return true
}

export function resolveStatsDtoPayload(
  stats: { data?: PlayerStatsDTO } | PlayerStatsDTO | null | undefined,
): PlayerStatsDTO | null | undefined {
  if (!stats) return stats
  if (typeof stats === 'object' && 'data' in stats && stats.data != null) {
    return stats.data
  }
  return stats as PlayerStatsDTO
}

export function assertStatsWriteIdentity(
  stats: { data?: PlayerStatsDTO } | PlayerStatsDTO | null | undefined,
  ctx: ProfileCacheWriteContext,
): boolean {
  if (!canApplyProfileCacheWrite(ctx)) return false
  const incoming = resolveStatsPayloadUserNum(resolveStatsDtoPayload(stats))
  if (
    ctx.expectedUserNum != null &&
    Number.isFinite(ctx.expectedUserNum) &&
    ctx.expectedUserNum > 0 &&
    incoming != null &&
    incoming !== ctx.expectedUserNum
  ) {
    return false
  }
  return true
}
