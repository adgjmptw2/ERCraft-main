import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProfileAnalysisHeroCard } from '@/components/profile/ProfileAnalysisHeroCard'

describe('ProfileAnalysisHeroCard', () => {
  it('RP 추이 위에 티어 이미지와 시즌 랭크 요약을 표시', () => {
    const { container } = render(
      <ProfileAnalysisHeroCard
        seasonNumber={11}
        rank={{ tier: '미스릴', rp: 8308 }}
        wins={260}
        losses={185}
        winRate={58}
        rpTrend={[
          { matchId: 'a', dateLabel: '6. 1.', rpAfter: 8100 },
          { matchId: 'b', dateLabel: '6. 2.', rpAfter: 8308 },
        ]}
        compactSummary={null}
        variant="sidebar"
      />,
    )

    expect(screen.getByLabelText('S11 랭크 요약')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '미스릴' })).toBeInTheDocument()
    expect(screen.getByText('8,308 RP')).toBeInTheDocument()
    expect(screen.getByText('445판')).toBeInTheDocument()
    expect(screen.getByText('승률 58%')).toBeInTheDocument()
    expect(screen.getByText('종합 등급 -')).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/tiers/mithril.webp')
    expect(screen.getByRole('img', { name: '최근 RP 추이 차트' })).toBeInTheDocument()
  })

  it('종합 V2 등급과 보정 breakdown을 표시하고 percentile은 표시하지 않음', () => {
    render(
      <ProfileAnalysisHeroCard
        seasonNumber={11}
        rank={{ tier: '미스릴', rp: 8308 }}
        wins={260}
        losses={185}
        winRate={58}
        rpTrend={[]}
        compactSummary={null}
        showRpTrend={false}
        overallReport={{
          status: 'ok',
          overallGrade: 'A',
          overallPerformanceScore: 69.36,
          overallScoreSource: 'overall-v2-hybrid',
          basePerformanceScore: 75.36,
          outcomePerformanceScore: 41,
          consistencyScore: 38,
          outcomeModifier: -4,
          consistencyModifier: -2,
          totalModifier: -6,
          overallConfidence: 0.9,
          overallConfidenceLabel: 'high',
          gradedCharacterCount: 3,
          weightedMatchCount: 40,
          confidenceStatus: 'ready',
          overallPercentile: null,
          summary: '',
          metrics: [],
          strengths: [],
          weaknesses: [],
          feedbackItems: [],
          sampleSize: 40,
          baselineLabel: '랭크 집계 기준',
          playerMatchCount: 40,
          bestCharacter: null,
        }}
      />,
    )

    expect(screen.getAllByText('종합 성과 등급')[0]).toBeInTheDocument()
    expect(screen.getByText('종합 A · 69점')).toBeInTheDocument()
    expect(screen.getByText('기본 캐릭터 성과')).toBeInTheDocument()
    expect(screen.getByText('-4.00')).toBeInTheDocument()
    expect(screen.getByText('-2.00')).toBeInTheDocument()
    expect(screen.queryByText(/백분위|상위/)).not.toBeInTheDocument()
  })
})
