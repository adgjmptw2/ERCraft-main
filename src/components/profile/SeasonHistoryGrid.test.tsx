import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SeasonHistoryGrid } from '@/components/profile/SeasonHistoryGrid'
import type { DemoSeasonRecord } from '@/mocks/seasonHistory'

function season(seasonNumber: number, tier = '미스릴'): DemoSeasonRecord {
  return {
    seasonNumber,
    rank: { tier: tier as DemoSeasonRecord['rank']['tier'], rp: 8000 },
    tier,
    wins: 10,
    losses: 5,
    avgPlacement: 4,
    kda: 3,
    top3Rate: 50,
    avgSurvivalSeconds: 1000,
    avgDamage: 12000,
    avgHeal: 0,
    objectiveContribution: 0,
  }
}

describe('SeasonHistoryGrid', () => {
  it('시즌을 가로 칩 형태로 S번호와 티어 이미지만 표시', () => {
    const { container } = render(
      <SeasonHistoryGrid
        seasons={[season(2, '다이아몬드'), season(1, '미스릴')]}
        selectedSeason={2}
        currentSeason={2}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'S1 미스릴' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'S2 다이아 1' })).toBeInTheDocument()
    expect(screen.queryByText('미스릴')).not.toBeInTheDocument()
    expect(container.querySelector('img[src="/assets/tiers/mithril.webp"]')).not.toBeNull()
  })

  it('disablePastSeasonSelection — S1~S10은 비클릭, S11만 클릭', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <SeasonHistoryGrid
        seasons={[season(10), season(11)]}
        selectedSeason={11}
        currentSeason={11}
        disablePastSeasonSelection
        onSelect={onSelect}
      />,
    )

    const pastChip = screen.getByLabelText('S10 미스릴')
    const currentButton = screen.getByRole('button', { name: 'S11 미스릴' })

    expect(screen.queryByRole('button', { name: /S10/ })).toBeNull()
    expect(currentButton).toBeInTheDocument()

    await user.click(pastChip)
    expect(onSelect).not.toHaveBeenCalled()

    await user.click(currentButton)
    expect(onSelect).toHaveBeenCalledWith(11)
  })
})
