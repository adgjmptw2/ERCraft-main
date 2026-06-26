import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TierBadge } from '@/components/shared/TierBadge'

describe('TierBadge', () => {
  it('매핑 가능한 티어는 이미지와 텍스트를 함께 렌더', () => {
    const { container } = render(<TierBadge tier="Gold IV" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', '/assets/tiers/gold.webp')
    expect(screen.getByText('Gold IV')).toBeInTheDocument()
  })

  it('상위 티어도 public 티어 이미지를 렌더', () => {
    const { container } = render(<TierBadge tier="데미갓" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/tiers/titan.webp')
    expect(screen.getByText('데미갓')).toBeInTheDocument()
  })

  it('이미지 실패 시 텍스트 배지 유지', () => {
    const { container } = render(<TierBadge tier="Mithril" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    fireEvent.error(img!)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Mithril')).toBeInTheDocument()
  })

  it('showTierImage=false면 이미지 요청 없음', () => {
    const { container } = render(<TierBadge tier="Gold IV" showTierImage={false} />)
    expect(container.querySelector('img')).toBeNull()
  })
})
