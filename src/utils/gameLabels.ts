import { localizeCharacterName, resolveCharacterDisplayName } from '@/utils/characterMap'

const TIER_EN_TO_KO: Record<string, string> = {
  unranked: '언랭크',
  iron: '아이언',
  bronze: '브론즈',
  silver: '실버',
  gold: '골드',
  platinum: '플래티넘',
  diamond: '다이아몬드',
  meteorite: '메테오라이트',
  mithril: '미스릴',
  demigod: '데미갓',
  eternity: '이터니티',
}

const ROMAN_TO_KO: Record<string, string> = {
  I: '1',
  II: '2',
  III: '3',
  IV: '4',
}

export function localizeTier(tier: string): string {
  const trimmed = tier.trim()
  if (!trimmed) return '—'

  const parts = trimmed.split(/\s+/)
  const head = parts[0]?.toLowerCase() ?? ''
  const koHead = TIER_EN_TO_KO[head]
  if (!koHead) return trimmed

  const tail = parts.slice(1).join(' ')
  if (!tail) return koHead

  const koTail = ROMAN_TO_KO[tail.toUpperCase()] ?? tail
  return `${koHead} ${koTail}`
}

export function localizeCharacter(name: string): string {
  return localizeCharacterName(name)
}

export { resolveCharacterDisplayName }

export function tierToken(tier: string): string {
  return localizeTier(tier).split(/\s+/)[0]?.toLowerCase() ?? ''
}

export { getAllCharacterKoNames } from '@/utils/characterMap'
