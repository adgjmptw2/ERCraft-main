import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileHero } from '@/components/profile/ProfileHero'
import type { PlayerSummary } from '@/types/player'

const summary: PlayerSummary = {
  userNum: 1,
  nickname: '농탐곰',
  level: 490,
  tier: 'MITHRIL',
}

const isRealModeMock = vi.hoisted(() => vi.fn(() => true))

vi.mock('@/api/erClient', () => ({
  isRealMode: () => isRealModeMock(),
}))

function renderHero(props: Partial<React.ComponentProps<typeof ProfileHero>> = {}) {
  return render(
    <MemoryRouter>
      <ProfileHero
        summary={summary}
        rankingPosition={null}
        selectedTier="MITHRIL"
        canRefresh
        onRefresh={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('ProfileHero refresh', () => {
  beforeEach(() => {
    isRealModeMock.mockReturnValue(true)
  })
  it('전적 갱신 버튼 클릭 시 onRefresh 호출', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    renderHero({ onRefresh })

    await user.click(screen.getByRole('button', { name: '전적 갱신' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('갱신 중 disabled 및 갱신 중... 라벨', () => {
    renderHero({ isRefreshing: true })
    const button = screen.getByRole('button', { name: '갱신 중...' })
    expect(button).toBeDisabled()
  })

  it('갱신 실패 메시지 표시', () => {
    renderHero({ refreshError: '백엔드 서버에 연결하지 못했습니다.' })
    expect(screen.getByRole('alert')).toHaveTextContent('백엔드 서버에 연결하지 못했습니다.')
  })

  it('갱신 성공 시 마지막 갱신 시각 표시', () => {
    renderHero({ freshnessLabel: '방금 갱신' })
    expect(screen.getByText('방금 갱신')).toBeInTheDocument()
  })

  it('canRefresh false면 버튼 숨김', () => {
    renderHero({ canRefresh: false, onRefresh: undefined })
    expect(screen.queryByRole('button', { name: /전적 갱신/ })).not.toBeInTheDocument()
  })

  it('level 없으면 Lv.1 fallback 대신 Lv.- 표시', () => {
    renderHero({ summary: { ...summary, level: null } })
    expect(screen.getByText('Lv.-')).toBeInTheDocument()
    expect(screen.queryByText('Lv.1')).not.toBeInTheDocument()
  })

  it('real mode에서는 showRankDetails=false여도 티어 배지 표시', () => {
    renderHero({ showRankDetails: false, rp: 8748, selectedTier: '데미갓' })
    expect(screen.getByText('데미갓')).toBeInTheDocument()
    expect(screen.queryByText('RP 8,748')).not.toBeInTheDocument()
  })
})

describe('ProfileHero mock mode', () => {
  it('데모 안내 문구 표시', () => {
    isRealModeMock.mockReturnValue(false)
    renderHero({ canRefresh: false, onRefresh: undefined })
    expect(screen.getByText('데모 데이터는 갱신할 수 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /전적 갱신/ })).not.toBeInTheDocument()
  })
})
