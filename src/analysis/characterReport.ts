import { computePlayerMetrics } from '@/analysis/feedbackRules'
import { calculatePercentileRank, gradeFromPercentile } from '@/analysis/percentile'
import type {
  AnalysisGrade,
  CharacterAnalysisReport,
  CharacterAnalysisSummary,
} from '@/analysis/types'
import type { MatchSummary } from '@/types/match'
import { resolveCharacterDisplayName } from '@/utils/characterMap'

const DEFAULT_MIN_GRADE_MATCHES = 2

export interface BuildCharacterReportsOptions {
  groupBy?: 'name' | 'character'
  minGradeMatches?: number
  feedbackContext?: 'demo' | 'profile'
}

function resolveCharacterGroup(
  match: MatchSummary,
  groupBy: BuildCharacterReportsOptions['groupBy'],
): { key: string; displayName: string } | null {
  const name = match.characterName?.trim()

  if (groupBy === 'character') {
    const num = match.characterNum
    if (typeof num === 'number' && Number.isInteger(num) && num > 0) {
      return {
        key: `num:${num}`,
        displayName: resolveCharacterDisplayName(num, name),
      }
    }
    if (name) return { key: `name:${name}`, displayName: name }
    return { key: 'unknown', displayName: '알 수 없음' }
  }

  if (!name) return null
  return { key: `name:${name}`, displayName: name }
}

function normalizeHigherBetter(value: number, min: number, max: number): number {
  if (max === min) return 50
  return ((value - min) / (max - min)) * 100
}

function normalizeLowerBetter(value: number, min: number, max: number): number {
  if (max === min) return 50
  return ((max - value) / (max - min)) * 100
}

function resolveCharacterNum(matches: MatchSummary[]): number | undefined {
  for (const match of matches) {
    const num = match.characterNum
    if (typeof num === 'number' && Number.isInteger(num) && num > 0) return num
  }
  return undefined
}

function averageMatchField(
  matches: MatchSummary[],
  pick: (match: MatchSummary) => number | undefined,
): number | null {
  const values = matches
    .map(pick)
    .filter((value): value is number => value != null && Number.isFinite(value))
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function buildCharacterAnalysisSummary(
  characterName: string,
  matches: MatchSummary[],
): CharacterAnalysisSummary | null {
  if (matches.length === 0) return null

  const metrics = computePlayerMetrics(matches)
  if (!metrics) return null

  const characterNum = resolveCharacterNum(matches)

  return {
    characterNum,
    characterName: resolveCharacterDisplayName(characterNum, characterName),
    matchCount: metrics.matchCount,
    avgPlacement: metrics.avgPlacement,
    avgKills: metrics.avgKills,
    avgAssists: metrics.avgAssists,
    avgTeamKills: averageMatchField(matches, (m) => m.teamKills ?? undefined),
    avgDamageToPlayers: averageMatchField(
      matches,
      (m) => m.damageToPlayers ?? m.playerDamage ?? undefined,
    ),
    kda: metrics.kda,
    top3Rate: metrics.top3Rate,
    winRate: metrics.winRate,
    overallScore: null,
  }
}

function computeOverallScore(
  summary: CharacterAnalysisSummary,
  pool: CharacterAnalysisSummary[],
  minGradeMatches: number,
): number | null {
  if (summary.matchCount < minGradeMatches) return null

  const gradeable = pool.filter((s) => s.matchCount >= minGradeMatches)
  if (gradeable.length === 0) return null

  const placements = gradeable.map((s) => s.avgPlacement)
  const kills = gradeable.map((s) => s.avgKills)
  const assists = gradeable.map((s) => s.avgAssists)
  const kdas = gradeable.map((s) => s.kda)
  const top3s = gradeable.map((s) => s.top3Rate)
  const wins = gradeable.map((s) => s.winRate)

  const scores = [
    normalizeLowerBetter(summary.avgPlacement, Math.min(...placements), Math.max(...placements)),
    normalizeHigherBetter(summary.avgKills, Math.min(...kills), Math.max(...kills)),
    normalizeHigherBetter(summary.avgAssists, Math.min(...assists), Math.max(...assists)),
    normalizeHigherBetter(summary.kda, Math.min(...kdas), Math.max(...kdas)),
    normalizeHigherBetter(summary.top3Rate, Math.min(...top3s), Math.max(...top3s)),
    normalizeHigherBetter(summary.winRate, Math.min(...wins), Math.max(...wins)),
  ]

  return scores.reduce((s, v) => s + v, 0) / scores.length
}

function buildCharacterFeedback(
  summary: CharacterAnalysisSummary,
  gradeableCount: number,
  minGradeMatches: number,
  feedbackContext: BuildCharacterReportsOptions['feedbackContext'],
): string {
  if (summary.matchCount < minGradeMatches) {
    return feedbackContext === 'profile'
      ? '표본이 부족해 참고 등급을 표시하지 않습니다.'
      : '아직 판단하기엔 표본이 적습니다.'
  }

  const messages: string[] = []
  const scopeLabel = feedbackContext === 'profile' ? '최근 경기' : '최근 데모 매치'

  if (summary.avgPlacement <= 3.5) {
    messages.push(`${scopeLabel} 기준으로 순위 안정성이 좋은 캐릭터로 보여요.`)
  } else if (summary.avgPlacement >= 6) {
    messages.push('순위 안정성은 점검해볼 만한 편이에요.')
  }

  if (summary.kda >= 4) {
    messages.push('교전 기여도가 비교적 안정적으로 나타납니다.')
  }

  if (summary.avgKills + summary.avgAssists >= 8 && summary.avgPlacement >= 5) {
    messages.push('교전 지표는 좋지만 순위로 이어지는 흐름은 점검해볼 만합니다.')
  }

  if (summary.top3Rate >= 60 || summary.winRate >= 50) {
    messages.push('상위권 마무리 비율이 좋아 현재 주력 후보로 볼 수 있습니다.')
  }

  if (messages.length === 0) {
    return gradeableCount > 1
      ? `${scopeLabel} 안에서 평균적인 흐름으로 보여요.`
      : '표본이 적어 참고용으로만 봐주세요.'
  }

  return messages[0]!
}

function assignGrades(
  summaries: CharacterAnalysisSummary[],
  options: Required<Pick<BuildCharacterReportsOptions, 'minGradeMatches' | 'feedbackContext'>>,
): CharacterAnalysisReport[] {
  const { minGradeMatches, feedbackContext } = options

  const withScores = summaries.map((s) => ({
    ...s,
    overallScore: computeOverallScore(s, summaries, minGradeMatches),
  }))

  const gradeableScores = withScores
    .filter((s) => s.overallScore != null)
    .map((s) => s.overallScore as number)

  const gradeableCount = gradeableScores.length

  const reports: CharacterAnalysisReport[] = withScores.map((s) => {
    if (s.matchCount < minGradeMatches) {
      return {
        ...s,
        status: 'insufficient-sample',
        overallGrade: null,
        gradeLabel: '표본 부족',
        feedback: buildCharacterFeedback(s, gradeableCount, minGradeMatches, feedbackContext),
      }
    }

    const percentile =
      s.overallScore != null && gradeableScores.length > 0
        ? calculatePercentileRank({
            value: s.overallScore,
            populationValues: gradeableScores,
            higherIsBetter: true,
          })
        : null

    const overallGrade: AnalysisGrade | null =
      percentile != null ? gradeFromPercentile(percentile) : null

    const gradeLabel =
      feedbackContext === 'profile' && overallGrade
        ? `${overallGrade} · 참고`
        : overallGrade
          ? `${overallGrade}등급`
          : '참고용'

    return {
      ...s,
      status: 'ok',
      overallGrade,
      gradeLabel,
      feedback: buildCharacterFeedback(s, gradeableCount, minGradeMatches, feedbackContext),
    }
  })

  return sortCharacterReports(reports)
}

export function sortCharacterReports(
  reports: CharacterAnalysisReport[],
  minGradeMatches = DEFAULT_MIN_GRADE_MATCHES,
): CharacterAnalysisReport[] {
  return [...reports].sort((a, b) => {
    const aGradeable = a.matchCount >= minGradeMatches ? 1 : 0
    const bGradeable = b.matchCount >= minGradeMatches ? 1 : 0
    if (aGradeable !== bGradeable) return bGradeable - aGradeable

    const aScore = a.overallScore ?? -1
    const bScore = b.overallScore ?? -1
    if (aScore !== bScore) return bScore - aScore

    if (a.matchCount !== b.matchCount) return b.matchCount - a.matchCount

    return a.characterName.localeCompare(b.characterName)
  })
}

export function buildCharacterAnalysisReports(
  matches: MatchSummary[],
  options?: BuildCharacterReportsOptions,
): CharacterAnalysisReport[] {
  if (matches.length === 0) return []

  const groupBy = options?.groupBy ?? 'name'
  const minGradeMatches = options?.minGradeMatches ?? DEFAULT_MIN_GRADE_MATCHES
  const feedbackContext = options?.feedbackContext ?? 'demo'

  const byCharacter = new Map<string, { displayName: string; matches: MatchSummary[] }>()
  for (const match of matches) {
    const group = resolveCharacterGroup(match, groupBy)
    if (!group) continue
    const bucket = byCharacter.get(group.key) ?? { displayName: group.displayName, matches: [] }
    bucket.matches.push(match)
    byCharacter.set(group.key, bucket)
  }

  const summaries: CharacterAnalysisSummary[] = []
  for (const { displayName, matches: charMatches } of byCharacter.values()) {
    const summary = buildCharacterAnalysisSummary(displayName, charMatches)
    if (summary) summaries.push(summary)
  }

  if (summaries.length === 0) return []

  return assignGrades(summaries, { minGradeMatches, feedbackContext })
}
