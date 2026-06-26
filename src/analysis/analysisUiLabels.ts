import type {
  AnalysisDataConfidence,
  AnalysisMetricAvailability,
  AnalysisMetricStatus,
} from '@/analysis/metricTypes'

export const ANALYSIS_DISCLAIMER =
  'ERCraft 자체 분석 기준입니다. 일부 지표는 공식 API 제공 범위에 따라 제외될 수 있습니다.'

export const SUMMARY_CARD_METRIC_IDS = [
  'tkInvolvementRate',
  'winRate',
  'avgPlacement',
  'avgPersonDamage',
  'viewContribution',
  'avgAnimalKills',
] as const

export interface AnalysisUiSectionConfig {
  id: string
  title: string
  description: string
  categories: readonly string[]
  defaultExpanded: boolean
  futureOnly?: boolean
}

export const ANALYSIS_UI_SECTIONS: readonly AnalysisUiSectionConfig[] = [
  {
    id: 'resultSurvival',
    title: '결과 · 생존',
    description: '순위·승률·생존 흐름',
    categories: ['result', 'survival'],
    defaultExpanded: true,
  },
  {
    id: 'combat',
    title: '교전 영향력',
    description: '딜·킬·TK 관여',
    categories: ['combat'],
    defaultExpanded: true,
  },
  {
    id: 'macro',
    title: '운영 흐름',
    description: '동물·크레딧·설치물',
    categories: ['macro'],
    defaultExpanded: false,
  },
  {
    id: 'support',
    title: '시야 · 지원',
    description: '정찰·회복·보호',
    categories: ['support'],
    defaultExpanded: false,
  },
  {
    id: 'consistency',
    title: '일관성',
    description: '성적 변동·후반 전환',
    categories: ['consistency'],
    defaultExpanded: false,
  },
  {
    id: 'teamPreview',
    title: '팀운',
    description: '팀원 성과와 캐리 부담을 분석합니다',
    categories: ['team'],
    defaultExpanded: false,
    futureOnly: true,
  },
] as const

const SECONDARY_METRIC_IDS = new Set(['avgAssists'])

export function isSecondaryMetric(id: string): boolean {
  return SECONDARY_METRIC_IDS.has(id)
}

export function getConfidenceLabel(confidence: AnalysisDataConfidence): string {
  switch (confidence) {
    case 'high':
      return '신뢰도 높음'
    case 'medium':
      return '신뢰도 보통'
    case 'low':
      return '신뢰도 낮음'
    case 'insufficient':
      return '표본 부족'
  }
}

export function getStatusBadgeLabel(
  status: AnalysisMetricStatus,
  availability?: AnalysisMetricAvailability,
): string | null {
  switch (status) {
    case 'ready':
      return null
    case 'partial':
      return '표본 부족'
    case 'unavailable':
      return '데이터 없음'
    case 'future':
      return availability === 'requiresDataset' ? '데이터 축적 후' : '일부 데이터'
  }
}

export function shouldShowMetricInSection(status: AnalysisMetricStatus, futureOnly: boolean): boolean {
  if (futureOnly) return status === 'future'
  if (status === 'future') return false
  if (status === 'unavailable') return false
  return true
}
