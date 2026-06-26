import type { CharacterFineGrade } from '@/utils/characterGrade'

export type MatchCelebrationLevel = 'none' | 'mvp'

export const MATCH_HIGHLIGHT_LEVEL_CLASS: Record<
  Exclude<MatchCelebrationLevel, 'none'>,
  string
> = {
  mvp: 'match-card--sparkle',
}

export interface MatchHighlightResult {
  level: MatchCelebrationLevel
  label: string
  description: string
}

const FINE_GRADE_ORDER: CharacterFineGrade[] = [
  'S+',
  'S',
  'S-',
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
]

const GRADE_RANK = new Map(FINE_GRADE_ORDER.map((grade, index) => [grade, index]))

const NONE_RESULT: MatchHighlightResult = {
  level: 'none',
  label: '',
  description: '',
}

function isValidPlacement(placement: number | null | undefined): placement is number {
  return typeof placement === 'number' && Number.isFinite(placement) && placement > 0
}

export function normalizeMatchGrade(grade: string | null | undefined): CharacterFineGrade | null {
  if (grade == null) return null
  const trimmed = grade.trim()
  if (!trimmed) return null
  return GRADE_RANK.has(trimmed as CharacterFineGrade) ? (trimmed as CharacterFineGrade) : null
}

export function compareMatchGrade(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const gradeA = normalizeMatchGrade(a)
  const gradeB = normalizeMatchGrade(b)
  if (!gradeA || !gradeB) return null
  return (GRADE_RANK.get(gradeB) ?? 0) - (GRADE_RANK.get(gradeA) ?? 0)
}

export function isMatchGradeAtLeast(
  grade: string | null | undefined,
  minimum: CharacterFineGrade,
): boolean {
  const normalized = normalizeMatchGrade(grade)
  if (!normalized) return false
  const gradeIndex = GRADE_RANK.get(normalized)
  const minimumIndex = GRADE_RANK.get(minimum)
  if (gradeIndex == null || minimumIndex == null) return false
  return gradeIndex <= minimumIndex
}

/** 1등 · S+ 경기만 MVP 하이라이트 */
export function getMatchHighlight(
  placement: number | null | undefined,
  grade: string | null | undefined,
): MatchHighlightResult {
  if (!isValidPlacement(placement)) return NONE_RESULT

  const normalizedGrade = normalizeMatchGrade(grade)

  if (placement === 1 && normalizedGrade === 'S+') {
    return {
      level: 'mvp',
      label: 'MVP',
      description: '1등 · S+ MVP',
    }
  }

  return NONE_RESULT
}

export interface MatchHighlightSummary {
  matchCount: number
  mvpMatches: number
}

export function summarizeMatchHighlights(
  matches: ReadonlyArray<{ placement: number; matchGrade: string | null | undefined }>,
): MatchHighlightSummary {
  let mvpMatches = 0

  for (const match of matches) {
    if (getMatchHighlight(match.placement, match.matchGrade).level === 'mvp') {
      mvpMatches += 1
    }
  }

  return {
    matchCount: matches.length,
    mvpMatches,
  }
}
