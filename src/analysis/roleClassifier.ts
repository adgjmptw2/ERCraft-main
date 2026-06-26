import type { MatchSummary } from '@/types/match'

export type PlayRole = '딜러' | '브루저' | '탱커' | '서포터' | '운영형'

export interface CharacterRoleProfile {
  primaryRole: PlayRole
  secondaryRole: PlayRole | null
}

export interface RoleBreakdownEntry {
  role: PlayRole
  score: number
  share: number
}

export interface RoleSummaryResult {
  status: 'ready' | 'insufficient'
  primaryRole: PlayRole | '판단 보류'
  secondaryRole: PlayRole | null
  roleBreakdown: RoleBreakdownEntry[]
  sampleSize: number
}

const ROLE_ORDER: PlayRole[] = ['딜러', '브루저', '탱커', '서포터', '운영형']

const CHARACTER_ROLE_MAP: Record<string, CharacterRoleProfile> = {
  Yuki: { primaryRole: '딜러', secondaryRole: '브루저' },
  Adela: { primaryRole: '딜러', secondaryRole: '운영형' },
  Hyejin: { primaryRole: '딜러', secondaryRole: '서포터' },
  Hayes: { primaryRole: '딜러', secondaryRole: null },
  Rio: { primaryRole: '딜러', secondaryRole: null },
  Rozzi: { primaryRole: '딜러', secondaryRole: null },
  Piolo: { primaryRole: '브루저', secondaryRole: null },
  Jackie: { primaryRole: '브루저', secondaryRole: null },
  Jan: { primaryRole: '브루저', secondaryRole: null },
  Felix: { primaryRole: '브루저', secondaryRole: null },
  'Li Dailin': { primaryRole: '브루저', secondaryRole: null },
  LiDailin: { primaryRole: '브루저', secondaryRole: null },
  Silvia: { primaryRole: '브루저', secondaryRole: null },
  Arda: { primaryRole: '딜러', secondaryRole: null },
  Aya: { primaryRole: '딜러', secondaryRole: '서포터' },
  Emma: { primaryRole: '딜러', secondaryRole: '운영형' },
  Fiona: { primaryRole: '딜러', secondaryRole: '브루저' },
  Lenny: { primaryRole: '서포터', secondaryRole: null },
  Magnus: { primaryRole: '탱커', secondaryRole: '브루저' },
  Hart: { primaryRole: '탱커', secondaryRole: '서포터' },
  Isol: { primaryRole: '딜러', secondaryRole: '운영형' },
}

const MIN_READY_MATCHES = 3
const SECONDARY_SCORE_RATIO = 0.35
const SECONDARY_MIN_MATCHES = 2

function normalizeCharacterKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function getCharacterRoleProfile(characterName: string): CharacterRoleProfile | null {
  const key = normalizeCharacterKey(characterName)
  return CHARACTER_ROLE_MAP[key] ?? null
}

function roleSort(a: PlayRole, b: PlayRole): number {
  return ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)
}

export function buildRoleSummary(
  matches: MatchSummary[],
  maxMatches = 20,
): RoleSummaryResult {
  const sample = matches.slice(0, maxMatches)
  const sampleSize = sample.length

  if (sampleSize < MIN_READY_MATCHES) {
    return {
      status: 'insufficient',
      primaryRole: '판단 보류',
      secondaryRole: null,
      roleBreakdown: [],
      sampleSize,
    }
  }

  const scores = new Map<PlayRole, number>()
  const secondaryMatchCounts = new Map<PlayRole, number>()

  for (const role of ROLE_ORDER) {
    scores.set(role, 0)
    secondaryMatchCounts.set(role, 0)
  }

  for (const match of sample) {
    const profile = getCharacterRoleProfile(match.characterName)
    if (!profile) continue

    scores.set(profile.primaryRole, (scores.get(profile.primaryRole) ?? 0) + 1)

    if (profile.secondaryRole) {
      scores.set(
        profile.secondaryRole,
        (scores.get(profile.secondaryRole) ?? 0) + 0.5,
      )
      secondaryMatchCounts.set(
        profile.secondaryRole,
        (secondaryMatchCounts.get(profile.secondaryRole) ?? 0) + 1,
      )
    }
  }

  const totalScore = [...scores.values()].reduce((sum, value) => sum + value, 0)
  if (totalScore <= 0) {
    return {
      status: 'insufficient',
      primaryRole: '판단 보류',
      secondaryRole: null,
      roleBreakdown: [],
      sampleSize,
    }
  }

  const ranked = ROLE_ORDER.map((role) => ({
    role,
    score: scores.get(role) ?? 0,
    share: Math.round(((scores.get(role) ?? 0) / totalScore) * 1000) / 10,
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || roleSort(a.role, b.role))

  const primary = ranked[0]
  if (!primary) {
    return {
      status: 'insufficient',
      primaryRole: '판단 보류',
      secondaryRole: null,
      roleBreakdown: [],
      sampleSize,
    }
  }

  const secondaryCandidate = ranked.find((entry) => entry.role !== primary.role)
  let secondaryRole: PlayRole | null = null

  if (secondaryCandidate) {
    const meetsScoreRatio = secondaryCandidate.score >= primary.score * SECONDARY_SCORE_RATIO
    const meetsMatchCount =
      (secondaryMatchCounts.get(secondaryCandidate.role) ?? 0) >= SECONDARY_MIN_MATCHES

    if (meetsScoreRatio || meetsMatchCount) {
      secondaryRole = secondaryCandidate.role
    }
  }

  return {
    status: 'ready',
    primaryRole: primary.role,
    secondaryRole,
    roleBreakdown: ranked,
    sampleSize,
  }
}
