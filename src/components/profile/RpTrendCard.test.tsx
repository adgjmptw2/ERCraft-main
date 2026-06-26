import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RpTrendCard } from '@/components/profile/RpTrendCard'

describe('RpTrendCard', () => {
  it('real 모드 insufficientData — mock 그래프 대신 empty state', () => {
    render(
      <RpTrendCard
        points={[{ matchId: 'a', dateLabel: '6/10', rpAfter: 8100 }]}
        chartState="insufficientData"
        emptyTitle="최근 경기별 RP 기록이 충분하지 않습니다."
        emptyDescription="RP 시계열을 그리려면 기록된 경기가 2판 이상 필요합니다."
        embedded
      />,
    )
    expect(screen.getByText('최근 경기별 RP 기록이 충분하지 않습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '최근 RP 추이 차트' })).not.toBeInTheDocument()
  })
})
