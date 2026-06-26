import { getRankTierFromRp } from '@/utils/rankTierFromRp'
import { formatMatchNumber } from '@/utils/matchDemoStats'

export function formatParticipantTierRpLine(
  rpAfter: number | null | undefined,
  displaySeasonId?: number | null,
): string {
  const rp =
    rpAfter != null && Number.isFinite(rpAfter) && rpAfter > 0 ? Math.round(rpAfter) : null
  const tier =
    rp != null ? getRankTierFromRp(rp, null, displaySeasonId ?? undefined) : null
  const tierLabel = tier && tier.tierId !== 'unranked' ? tier.displayLabel : null

  if (tierLabel && rp != null) {
    return `${tierLabel} · ${formatMatchNumber(rp)} RP`
  }
  if (tierLabel) return tierLabel
  if (rp != null) return `${formatMatchNumber(rp)} RP`
  return '—'
}
