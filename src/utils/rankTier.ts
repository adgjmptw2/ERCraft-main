import type { RankTierName, SeasonRank } from '@/types/rank'
import { DIVISION_RANK_TIERS } from '@/types/rank'

const TIER_ACCENT: Record<RankTierName, string> = {
  아이언: '#9ca3af',
  브론즈: '#cd7f32',
  실버: '#c0c0c0',
  골드: '#f0b429',
  플래티넘: '#4fc3b0',
  다이아몬드: '#60a5fa',
  메테오라이트: '#67e8f9',
  미스릴: '#3b82f6',
  데미갓: '#e2e8f0',
  이터니티: '#ef4444',
}

export function tierHasDivision(tier: RankTierName): boolean {
  return (DIVISION_RANK_TIERS as readonly string[]).includes(tier)
}

export function tierAccentColor(tier: RankTierName | string): string {
  const head = tier.trim().split(/\s+/)[0] as RankTierName
  return TIER_ACCENT[head] ?? '#9ca3af'
}

const COMPACT_TIER_LABEL: Partial<Record<RankTierName, string>> = {
  다이아몬드: '다이아',
  메테오라이트: '메테오',
  데미갓: '데미',
  이터니티: '이터',
}

export function compactTierName(tier: RankTierName): string {
  return COMPACT_TIER_LABEL[tier] ?? tier
}

export function formatTierBadge(rank: SeasonRank): string {
  if (!tierHasDivision(rank.tier)) return rank.tier
  return `${rank.tier} ${rank.division ?? 1}`
}

/** 시즌 그리드 등 좁은 뱃지용 — 다이아몬드→다이아, 메테오라이트→메테오 */
export function formatTierBadgeCompact(rank: SeasonRank): string {
  if (!tierHasDivision(rank.tier)) return compactTierName(rank.tier)
  return `${compactTierName(rank.tier)} ${rank.division ?? 1}`
}

export function formatTierDetail(rank: SeasonRank): string {
  if ((rank.tier as string) === '언랭크') return '언랭크'
  const rp = rank.rp.toLocaleString('ko-KR')
  const badge = formatTierBadge(rank)

  if (rank.tier === '데미갓' || rank.tier === '이터니티') {
    return `${badge} · ${rp} RP · #${rank.rank ?? '—'}`
  }

  return `${badge} · ${rp} RP`
}

export function seasonRankToSummaryTier(rank: SeasonRank): string {
  return formatTierBadge(rank)
}
