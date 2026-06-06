import type { MatchSummary } from '@/types/match'
import type {
  FeedbackItem,
  MetricComparison,
  PlayerAnalysisReport,
  PlayerMetricSnapshot,
} from '@/analysis/types'

const PLACEMENT_GOOD = 60
const PLACEMENT_WEAK = 35
const COMBAT_GOOD = 65

export function buildFeedbackFromReport(
  report: Pick<PlayerAnalysisReport, 'metrics' | 'bestCharacter' | 'status'>,
): FeedbackItem[] {
  if (report.status !== 'ok') return []

  const items: FeedbackItem[] = []
  const byKey = new Map(report.metrics.map((m) => [m.key, m]))

  const placement = byKey.get('avgPlacement')
  if (placement?.percentile != null) {
    if (placement.percentile >= PLACEMENT_GOOD) {
      items.push({
        type: 'strength',
        message: '최근 샘플 기준으로 순위 안정성이 좋은 편으로 보여요.',
      })
    } else if (placement.percentile <= PLACEMENT_WEAK) {
      items.push({
        type: 'weakness',
        message:
          '최근 경기에서 순위 안정성이 낮게 나타났어요. 무리한 교전보다 후반 생존을 우선하는 흐름을 점검해보세요.',
      })
    }
  }

  const kills = byKey.get('avgKills')
  const kda = byKey.get('kda')
  if (
    placement?.percentile != null &&
    placement.percentile <= PLACEMENT_WEAK &&
    kills?.percentile != null &&
    kills.percentile >= COMBAT_GOOD
  ) {
    items.push({
      type: 'weakness',
      message:
        '교전 기여도는 좋은 편이지만 순위로 이어지지 않는 경향이 있어요. 교전 후 회복·철수 타이밍을 점검해보세요.',
    })
  }

  if (kda?.percentile != null && kda.percentile >= COMBAT_GOOD) {
    items.push({
      type: 'strength',
      message: 'KDA는 샘플 평균 대비 높은 편으로 보여요.',
    })
  }

  const top3 = byKey.get('top3Rate')
  if (top3?.percentile != null && top3.percentile >= PLACEMENT_GOOD) {
    items.push({
      type: 'strength',
      message: '상위권(3위 이내) 비율이 샘플 평균보다 높은 편이에요.',
    })
  }

  const winRate = byKey.get('winRate')
  if (winRate?.percentile != null && winRate.percentile <= PLACEMENT_WEAK) {
    items.push({
      type: 'weakness',
      message: '승리 비율은 샘플 평균보다 낮게 나타났어요. 초반 교전 선택을 한 번 점검해보세요.',
    })
  }

  if (report.bestCharacter) {
    items.push({
      type: 'info',
      message: `현재 샘플 기준으로는 ${report.bestCharacter.name} 플레이가 가장 안정적이에요.`,
    })
  }

  return items
}

export function splitStrengthsWeaknesses(items: FeedbackItem[]): {
  strengths: FeedbackItem[]
  weaknesses: FeedbackItem[]
} {
  return {
    strengths: items.filter((i) => i.type === 'strength' || i.type === 'info').slice(0, 2),
    weaknesses: items.filter((i) => i.type === 'weakness').slice(0, 2),
  }
}

export function buildSummaryFromMetrics(
  metrics: MetricComparison[],
  overallGrade: PlayerAnalysisReport['overallGrade'],
): string {
  if (!overallGrade) return '분석할 수 있는 지표가 부족해요.'

  const placement = metrics.find((m) => m.key === 'avgPlacement')
  const kda = metrics.find((m) => m.key === 'kda')

  if (placement?.grade === 'S' || placement?.grade === 'A') {
    return '샘플 기준 순위 안정성과 전투 기여가 균형 있게 보이는 편이에요.'
  }
  if (kda?.grade === 'S' || kda?.grade === 'A') {
    return '교전 기여도는 샘플 평균 대비 좋은 편이에요. 순위로 연결되는지 함께 보면 좋아요.'
  }
  if (placement?.grade === 'D' || placement?.grade === 'C') {
    return '순위 안정성이 샘플 평균보다 낮게 나타났어요. 후반 생존 흐름을 점검해보세요.'
  }
  return '샘플 데이터 기준으로 전반적인 플레이 흐름을 정리했어요.'
}

export function pickBestCharacter(
  matches: MatchSummary[],
): PlayerAnalysisReport['bestCharacter'] {
  const byChar = new Map<string, { placements: number[] }>()
  for (const m of matches) {
    const entry = byChar.get(m.characterName) ?? { placements: [] }
    entry.placements.push(m.placement)
    byChar.set(m.characterName, entry)
  }

  let best: PlayerAnalysisReport['bestCharacter'] = null
  for (const [name, { placements }] of byChar) {
    if (placements.length < 2) continue
    const avg = placements.reduce((s, p) => s + p, 0) / placements.length
    if (!best || avg < best.avgPlacement) {
      best = { name, avgPlacement: avg, games: placements.length }
    }
  }
  return best
}

export function computePlayerMetrics(matches: MatchSummary[]): PlayerMetricSnapshot | null {
  if (matches.length === 0) return null

  const n = matches.length
  const totalKills = matches.reduce((s, m) => s + m.kills, 0)
  const totalDeaths = matches.reduce((s, m) => s + m.deaths, 0)
  const totalAssists = matches.reduce((s, m) => s + m.assists, 0)
  const kda = totalDeaths === 0 ? totalKills + totalAssists : (totalKills + totalAssists) / totalDeaths

  return {
    avgPlacement: matches.reduce((s, m) => s + m.placement, 0) / n,
    avgKills: totalKills / n,
    avgAssists: totalAssists / n,
    kda,
    top3Rate: (matches.filter((m) => m.placement <= 3).length / n) * 100,
    winRate: (matches.filter((m) => m.victory).length / n) * 100,
    matchCount: n,
  }
}
