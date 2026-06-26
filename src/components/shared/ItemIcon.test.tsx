import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ItemIcon } from '@/components/shared/ItemIcon'
import { LoadoutIcon } from '@/components/shared/LoadoutIcon'
import { TacticalSkillIcon } from '@/components/shared/TacticalSkillIcon'
import { TraitIcon } from '@/components/shared/TraitIcon'
import { WeaponTypeIcon } from '@/components/shared/WeaponTypeIcon'
import { GAME_ASSET_ICON_IMG_CLASS } from '@/components/shared/GameAssetIcon'

describe('ItemIcon', () => {
  it('URL 없으면 fallback 슬롯', () => {
    const { container } = render(<ItemIcon slug="unknown-item" label="테스트" />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('검증된 slug면 img 렌더', () => {
    const { container } = render(<ItemIcon slug="material/battery" label="배터리" decorative={false} />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', '/assets/items/material/battery.webp')
    expect(img).toHaveAttribute('alt', '배터리 아이콘')
  })

  it('img에 object-contain 적용, object-cover 미사용', () => {
    const { container } = render(<ItemIcon slug="material/battery" label="배터리" />)
    const img = container.querySelector('img')
    expect(img?.className).toContain('object-contain')
    expect(img?.className).not.toContain('object-cover')
    expect(img?.className).toContain('scale-[0.97]')
  })

  it('onError 시 fallback', () => {
    const { container } = render(
      <ItemIcon slug="material/battery" label="배터리" decorative={false} />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    fireEvent.error(img!)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTitle('배터리')).toBeInTheDocument()
  })
})

describe('TraitIcon / LoadoutIcon', () => {
  it('TraitIcon 검증 slug — 원형', () => {
    const { container } = render(<TraitIcon slug="chaos/stopping-power" />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', '/assets/loadout/chaos/stopping-power.webp')
    expect(img?.className).toContain('rounded-full')
    expect(img?.className).toContain('object-contain')
    expect(img?.className).not.toContain('object-cover')
  })

  it('LoadoutIcon 미검증 slug fallback', () => {
    const { container } = render(<LoadoutIcon slug="not-a-real-trait" />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('WeaponTypeIcon / TacticalSkillIcon', () => {
  it('무기·전술 스킬 img에 object-contain 적용', () => {
    const weapon = render(
      <WeaponTypeIcon slug="weapons/weapon-group/arcana" decorative={false} label="무기" />,
    )
    const weaponImg = weapon.container.querySelector('img')
    expect(weaponImg?.className).toContain('object-contain')
    expect(weaponImg?.className).not.toContain('object-cover')

    const skill = render(
      <TacticalSkillIcon slug="tactical-skills/blink" decorative={false} label="스킬" />,
    )
    const skillImg = skill.container.querySelector('img')
    expect(skillImg?.className).toContain('object-contain')
    expect(skillImg?.className).not.toContain('object-cover')
  })
})

describe('GAME_ASSET_ICON_IMG_CLASS', () => {
  it('공통 img fit 클래스 export', () => {
    expect(GAME_ASSET_ICON_IMG_CLASS).toContain('object-contain')
    expect(GAME_ASSET_ICON_IMG_CLASS).toContain('scale-[0.97]')
  })
})
