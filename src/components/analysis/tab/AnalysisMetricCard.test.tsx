import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AnalysisMetricCard } from '@/components/analysis/tab/AnalysisMetricCard'

describe('AnalysisMetricCard', () => {
  it('ready 상태에서는 배지를 표시하지 않음', () => {
    render(
      <AnalysisMetricCard
        card={{
          id: 'winRate',
          label: '승률',
          value: '52.3%',
          hint: '1위 비율',
          size: 'medium',
          status: 'ready',
        }}
      />,
    )
    expect(screen.getByText('52.3%')).toBeInTheDocument()
    expect(screen.queryByText('계산됨')).not.toBeInTheDocument()
  })

  it('future 상태 배지 렌더', () => {
    render(
      <AnalysisMetricCard
        card={{
          id: 'teamDamageShare',
          label: '팀 내 딜 기여',
          value: '상세 경기 데이터 필요',
          hint: '팀 총 딜량 중 내 비율',
          size: 'small',
          status: 'future',
          unavailable: true,
        }}
        variant="future"
      />,
    )
    expect(screen.getByText('일부 데이터')).toBeInTheDocument()
  })
})
