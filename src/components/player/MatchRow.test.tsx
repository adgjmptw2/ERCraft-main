import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MatchRow } from '@/components/player/MatchRow'
import type { MatchSummaryDTO } from '@/types/match'
import { toMatchSummaryDTO } from '@/utils/dto'

vi.mock('@/api/erClient', () => ({
  isRealMode: () => false,
}))

function renderMatchRow(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function makeMatch(overrides: Partial<MatchSummaryDTO> = {}): MatchSummaryDTO {
  const base = toMatchSummaryDTO({
    matchId: 'test-match',
    userNum: 1,
    characterNum: 11,
    characterName: 'Yuki',
    placement: 1,
    kills: 3,
    deaths: 1,
    assists: 2,
    gameStartedAt: '2026-04-01T00:00:00.000Z',
    victory: true,
    gameMode: 'rank',
  })
  return { ...base, ...overrides }
}

describe('MatchRow', () => {
  it('record variant가 characterNum 초상화 URL을 사용', () => {
    const { container } = renderMatchRow(<MatchRow match={makeMatch()} variant="record" />)
    const img = container.querySelector('img[src*="/assets/characters/"]')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', '/assets/characters/11.webp')
  })

  it('characterNum 없으면 이니셜 fallback', () => {
    const { container } = renderMatchRow(
      <MatchRow match={makeMatch({ characterNum: undefined, characterName: '유키' })} variant="record" />,
    )
    expect(container.querySelector('img[src*="/assets/characters/"]')).toBeNull()
    expect(container.textContent).toContain('유')
  })

  it('equipmentPreview 없으면 빈 장비 슬롯만 렌더', () => {
    const { container } = renderMatchRow(<MatchRow match={makeMatch()} variant="record" />)
    expect(container.querySelectorAll('img[src*="/assets/items/"]')).toHaveLength(0)
    expect(container.querySelectorAll('img[src*="/assets/loadout/"]')).toHaveLength(0)
  })

  it('equipmentPreview — 슬롯별 검증 slug만 아이콘 요청', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          equipmentPreview: {
            weaponTypeSlug: 'weapons/weapon-group/arcana',
            tacticalSkillSlug: 'tactical-skills/blink',
            mainTraitSlug: 'havoc/vampiric-bloodline',
            subTraitSlug: 'invalid-trait',
            gear: {
              weapon: 'weapons/arcana/glass-bead',
              chest: 'armor/chest/battle-suit',
              head: 'fake-head',
            },
          },
        })}
        variant="record"
      />,
    )

    expect(container.querySelector('img[src*="/assets/items/weapons/weapon-group/arcana"]')).not.toBeNull()
    expect(container.querySelector('img[src*="/assets/loadout/tactical-skills/blink"]')).not.toBeNull()
    expect(container.querySelector('img[src*="/assets/loadout/havoc/vampiric-bloodline"]')).not.toBeNull()
    // 모바일·데스크톱 레이아웃이 동시에 마운트됨 — 검증된 loadout 2종 × 2
    expect(container.querySelectorAll('img[src*="/assets/loadout/"]')).toHaveLength(4)
    // 무기종류 + 장비 2슬롯 × 모바일·데스크톱
    expect(container.querySelectorAll('img[src*="/assets/items/"]')).toHaveLength(6)
    expect(container.innerHTML).not.toContain('fake-head')
    expect(container.innerHTML).not.toContain('invalid-trait')
  })

  it('특성 슬롯은 우측 열만 원형', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          equipmentPreview: {
            weaponTypeSlug: 'weapons/weapon-group/arcana',
            tacticalSkillSlug: 'tactical-skills/blink',
            mainTraitSlug: 'havoc/vampiric-bloodline',
            subTraitSlug: 'chaos/red-sprite',
          },
        })}
        variant="record"
      />,
    )
    const loadoutGrid = container.querySelector('[aria-label="무기·스킬·특성"]')
    const icons = loadoutGrid?.querySelectorAll('img') ?? []
    expect(icons).toHaveLength(4)
    expect(icons[0]?.className).not.toContain('rounded-full')
    expect(icons[1]?.className).toContain('rounded-full')
    expect(icons[2]?.className).not.toContain('rounded-full')
    expect(icons[3]?.className).toContain('rounded-full')
  })

  it('전술 스킬 level이 있으면 badge를 표시한다', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          tacticalSkillGroup: 171,
          equipmentPreview: {
            tacticalSkillSlug: 'tactical-skills/plasma-dash',
          },
        })}
        variant="record"
      />,
    )

    expect(container.querySelector('[aria-label="레벨 1"]')).not.toBeNull()
  })

  it('전술 스킬 level 0이면 tactical badge를 표시하지 않는다', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          characterLevel: null,
          tacticalSkillGroup: 170,
          equipmentPreview: {
            tacticalSkillSlug: 'tactical-skills/plasma-dash',
          },
        })}
        variant="record"
      />,
    )

    const loadoutGrids = container.querySelectorAll('[aria-label="무기·스킬·특성"]')
    for (const grid of loadoutGrids) {
      expect(grid.querySelector('[aria-label^="레벨 "]')).toBeNull()
    }
  })

  it('character level badge를 표시한다', () => {
    const { container } = renderMatchRow(
      <MatchRow match={makeMatch({ characterLevel: 20 })} variant="record" />,
    )

    expect(container.querySelector('[aria-label="레벨 20"]')).not.toBeNull()
    expect(container.textContent).not.toMatch(/Lv\.20/)
  })

  it('1등 S+ 경기에 sparkle class와 MVP chip을 렌더', () => {
    const { container } = renderMatchRow(
      <MatchRow match={makeMatch({ placement: 1, matchGrade: 'S+' })} variant="record" />,
    )
    expect(container.querySelector('.match-card--sparkle')).not.toBeNull()
    expect(container.querySelector('.match-card__sparkle-chip')).not.toBeNull()
    expect(container.textContent).toContain('MVP')
    expect(container.innerHTML).not.toMatch(/SSS|상위|백분위|빤짝이/i)
  })

  it('1등 S 경기는 MVP chip 없음', () => {
    const { container } = renderMatchRow(
      <MatchRow match={makeMatch({ placement: 1, matchGrade: 'S' })} variant="record" />,
    )
    expect(container.querySelector('.match-card__sparkle-chip')).toBeNull()
  })

  it('일반 경기는 sparkle class 없이 기존 구조 유지', () => {
    const { container } = renderMatchRow(
      <MatchRow match={makeMatch({ placement: 5, matchGrade: 'B' })} variant="record" />,
    )
    expect(container.querySelector('.match-card--sparkle')).toBeNull()
    expect(container.querySelector('.match-card__sparkle-chip')).toBeNull()
    expect(container.querySelector('.border-l-\\[3px\\]')).not.toBeNull()
  })

  it('real 값이 없으면 demo fallback 대신 - 표시', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          teamKill: null,
          playerDamage: null,
          rpDeltaValue: null,
          matchGrade: null,
          teamLuck: null,
          teamLuckIcon: '',
          teamLuckLabel: '-',
          characterLevel: null,
        })}
        variant="record"
      />,
    )

    expect(container.querySelector('[aria-label^="레벨 "]')).toBeNull()
    expect(container.textContent).toContain('딜량')
    expect(container.textContent).toContain('등급')
    expect(container.textContent).toContain('-')
    expect(container.querySelector('.match-card__sparkle-chip')).toBeNull()
  })

  it('접힌 rank match는 팀운 날씨와 상태만 표시하고 원점수·캐리 부담은 숨긴다', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          teamPerformance: {
            status: 'ready',
            teammateCount: 2,
            gradedTeammateCount: 2,
            ownPerformanceScore: 78.4,
            teammatePerformanceScore: 63.2,
            teammatePerformanceDelta: -1.8,
            teammatePerformanceLabel: '보통',
            carryBurdenDelta: 15.2,
            carryBurdenLabel: '매우 높은 캐리 부담',
          },
        })}
        variant="record"
      />,
    )

    expect(container.textContent).toContain('팀운')
    expect(container.textContent).toContain('⛅ 보통')
    expect(container.textContent).not.toContain('63.2')
    expect(container.textContent).not.toContain('캐리 부담')
    expect(container.textContent).not.toContain('+15.2')
  })

  it('열린 rank match 상세에는 서비스형 팀운·캐리 균형 문구를 표시한다', () => {
    renderMatchRow(
      <MatchRow
        match={makeMatch({
          teamPerformance: {
            status: 'partial',
            teammateCount: 2,
            gradedTeammateCount: 1,
            ownPerformanceScore: 70,
            teammatePerformanceScore: 60,
            teammatePerformanceDelta: -5,
            teammatePerformanceLabel: '보통',
            teamLuckResidual: 60,
            teamLuckLabel: '보통',
            ownResidual: 70,
            teammateResidualAverage: 60,
            carryBurdenResidual: 10,
            confidence: 'medium',
            fallbackLevel: 'L2',
            sampleCount: 42,
            carryBurdenDelta: 10,
            carryBurdenLabel: '높은 캐리 부담',
          },
        })}
        variant="record"
      />,
    )

    expect(screen.getAllByText('⛅ 보통').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('60.0')
    expect(document.body.textContent).not.toContain('캐리 부담')

    fireEvent.click(screen.getByRole('button', { name: '매치 상세 펼치기' }))

    expect(screen.getAllByText('팀운').length).toBeGreaterThan(0)
    expect(screen.getByText('평균 대비')).toBeInTheDocument()
    expect(screen.getAllByText('+60.0').length).toBeGreaterThan(0)
    expect(screen.getByText('내 플레이 평균 대비')).toBeInTheDocument()
    expect(screen.getByText('캐리 균형')).toBeInTheDocument()
    expect(screen.getByText('높음')).toBeInTheDocument()
    expect(screen.getByText('+10.0')).toBeInTheDocument()
    expect(screen.getByText('팀원 1명의 기록만 반영되어 결과가 달라질 수 있어요.')).toBeInTheDocument()
    expect(screen.getByText(/함께 플레이한 팀원들의 실제 경기 성과/)).toBeInTheDocument()
    expect(screen.getByText('유사 조건 기준')).toBeInTheDocument()
    expect(screen.getByText('42건')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('residual')
    expect(document.body.textContent).not.toContain('신뢰도')
    expect(document.body.textContent).not.toContain('L2')
    expect(document.body.textContent).not.toContain('n=42')
    expect(document.body.textContent).not.toContain('fallback')
    expect(document.body.textContent).not.toContain('수행 능력')
  })

  it('unavailable 또는 cobalt team performance는 점수 0이나 보조 지표를 표시하지 않는다', () => {
    const unavailable = renderMatchRow(
      <MatchRow
        match={makeMatch({
          teamPerformance: {
            status: 'unavailable',
            teammateCount: 2,
            gradedTeammateCount: 0,
            ownPerformanceScore: 70,
            teammatePerformanceScore: null,
            teammatePerformanceDelta: null,
            teammatePerformanceLabel: null,
            carryBurdenDelta: null,
            carryBurdenLabel: null,
          },
        })}
        variant="record"
      />,
    )
    expect(unavailable.container.textContent).toContain('팀운')
    expect(unavailable.container.textContent).toContain('미집계')
    expect(unavailable.container.textContent).not.toContain('☀')
    expect(unavailable.container.textContent).not.toContain('🌤')
    expect(unavailable.container.textContent).not.toContain('⛅')
    expect(unavailable.container.textContent).not.toContain('☁')
    expect(unavailable.container.textContent).not.toContain('🌧')
    expect(unavailable.container.textContent).not.toContain('캐리 부담')
    expect(unavailable.container.textContent).not.toContain('0.0')

    const cobalt = renderMatchRow(
      <MatchRow
        match={makeMatch({
          gameMode: 'cobalt',
          gameModeLabel: '코발트',
          matchGrade: null,
          rpDeltaValue: null,
          teamPerformance: {
            status: 'ready',
            teammateCount: 2,
            gradedTeammateCount: 2,
            ownPerformanceScore: 90,
            teammatePerformanceScore: 80,
            teammatePerformanceDelta: 15,
            teammatePerformanceLabel: '매우 좋음',
            carryBurdenDelta: 10,
            carryBurdenLabel: '높은 캐리 부담',
          },
        })}
        variant="record"
      />,
    )
    expect(cobalt.container.textContent).not.toContain('팀운')
    expect(cobalt.container.textContent).not.toContain('캐리 부담')
  })

  it('상세 펼치기 버튼은 같은 자리의 커스텀 SVG로 열림/닫힘 상태를 바꾼다', () => {
    renderMatchRow(<MatchRow match={makeMatch()} variant="record" />)

    const openButton = screen.getByRole('button', { name: '매치 상세 펼치기' })
    expect(screen.getAllByRole('button', { name: /매치 상세/ })).toHaveLength(1)
    expect(openButton).toHaveAttribute('aria-expanded', 'false')
    expect(openButton).toHaveClass('top-[3.5rem]')
    expect(openButton).toHaveTextContent('')
    expect(openButton.querySelector('svg')).not.toBeNull()
    expect(openButton.querySelector('path')?.getAttribute('d')).toBe('M3 3.5L10 8.5L17 3.5')

    fireEvent.click(openButton)
    const closeButton = screen.getByRole('button', { name: '매치 상세 접기' })
    expect(screen.getAllByRole('button', { name: /매치 상세/ })).toHaveLength(1)
    expect(closeButton).toHaveAttribute('aria-expanded', 'true')
    expect(closeButton).toHaveClass('top-[3.5rem]')
    expect(closeButton).toHaveTextContent('')
    expect(closeButton.querySelector('svg')).not.toBeNull()
    expect(closeButton.querySelector('path')?.getAttribute('d')).toBe('M3 8.5L10 3.5L17 8.5')
    expect(screen.getByText(/데모 모드/)).toBeInTheDocument()

    fireEvent.click(closeButton)
    const reopenedButton = screen.getByRole('button', { name: '매치 상세 펼치기' })
    expect(reopenedButton).toHaveAttribute('aria-expanded', 'false')
    expect(reopenedButton.querySelector('path')?.getAttribute('d')).toBe('M3 3.5L10 8.5L17 3.5')
    expect(screen.queryByText(/데모 모드/)).not.toBeInTheDocument()
  })

  it('팀운이 없어도 데스크톱 팀운 column은 유지하고 빈 값은 표시하지 않는다', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          teamPerformance: undefined,
        })}
        variant="record"
      />,
    )

    expect(container.textContent).toContain('팀운')
    expect(container.textContent).toContain('미집계')
    expect(container.textContent).not.toContain('데이터 없음')
    expect(container.textContent).not.toContain('0.0')
  })

  it('cobalt match에서는 infusion 영역 표시, rank에서는 RP/등급 유지', () => {
    const rank = renderMatchRow(
      <MatchRow match={makeMatch({ gameMode: 'rank', cobaltInfusions: [32] })} variant="record" />,
    )
    expect(rank.container.textContent).toContain('등급')
    expect(rank.container.querySelector('[title="인퓨전 32"]')).toBeNull()

    const cobalt = renderMatchRow(
      <MatchRow
        match={makeMatch({
          gameMode: 'cobalt',
          gameModeLabel: '코발트',
          cobaltInfusions: [32],
          matchGrade: null,
          rpDeltaValue: null,
        })}
        variant="record"
      />,
    )
    expect(cobalt.container.textContent).toContain('광견병')
    expect(cobalt.container.textContent).not.toContain('등급')
    expect(cobalt.container.querySelector('[title="광견병"]')).not.toBeNull()
  })

  it('cobalt match loadout은 보조 특성 슬롯 없이 3개 아이콘만 표시', () => {
    const preview = {
      weaponTypeSlug: 'weapons/weapon-group/arcana',
      tacticalSkillSlug: 'tactical-skills/blink',
      mainTraitSlug: 'havoc/vampiric-bloodline',
      subTraitSlug: 'chaos/red-sprite',
    }

    const rank = renderMatchRow(
      <MatchRow match={makeMatch({ equipmentPreview: preview })} variant="record" />,
    )
    const cobalt = renderMatchRow(
      <MatchRow
        match={makeMatch({
          gameMode: 'cobalt',
          gameModeLabel: '코발트',
          equipmentPreview: preview,
        })}
        variant="record"
      />,
    )

    for (const grid of rank.container.querySelectorAll('[aria-label="무기·스킬·특성"]')) {
      expect(grid.querySelectorAll('img')).toHaveLength(4)
    }
    for (const grid of cobalt.container.querySelectorAll('[aria-label="무기·스킬·특성"]')) {
      expect(grid.querySelectorAll('img')).toHaveLength(3)
      expect(grid.innerHTML).not.toContain('red-sprite')
    }
  })

  it('cobalt match는 grade가 내려와도 badge와 sparkle을 렌더하지 않음', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          gameMode: 'cobalt',
          gameModeLabel: '코발트',
          placement: 1,
          cobaltInfusions: [13],
          matchGrade: 'S+',
          rpDeltaValue: null,
        })}
        variant="record"
      />,
    )

    expect(container.textContent).not.toContain('등급')
    expect(container.querySelector('.match-card--sparkle')).toBeNull()
    expect(container.querySelector('.match-card__sparkle-chip')).toBeNull()
  })

  it('cobalt infusion short code는 # fallback 대신 안전 라벨 표시', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          gameMode: 'cobalt',
          gameModeLabel: '코발트',
          cobaltInfusions: [32, 61, 48],
          rpDeltaValue: null,
          matchGrade: null,
        })}
        variant="record"
      />,
    )

    expect(container.textContent).not.toContain('#32')
    expect(container.querySelector('[title="광견병"]')).not.toBeNull()
    expect(container.querySelector('[title="수집가"]')).not.toBeNull()
    expect(container.querySelector('[title="오염된 늪"]')).not.toBeNull()
    expect(
      container.querySelector('img[src*="infusion-cobalt-protocol/miasma-fog"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('img[src*="infusion-cobalt-protocol/overwatch"]'),
    ).toBeNull()
  })

  it('확인된 cobalt infusion code 13은 쿨다운 감소로 표시', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          gameMode: 'cobalt',
          gameModeLabel: '코발트',
          cobaltInfusions: [13],
          rpDeltaValue: null,
          matchGrade: null,
        })}
        variant="record"
      />,
    )

    expect(container.querySelector('[title="쿨다운 감소"]')).not.toBeNull()
    expect(container.textContent).not.toContain('인퓨전 13')
    expect(container.textContent).not.toContain('Overwatch')
  })

  it('장비·로드아웃 아이콘 img에 object-contain 적용, object-cover 미사용', () => {
    const { container } = renderMatchRow(
      <MatchRow
        match={makeMatch({
          equipmentPreview: {
            weaponTypeSlug: 'weapons/weapon-group/arcana',
            tacticalSkillSlug: 'tactical-skills/blink',
            mainTraitSlug: 'havoc/vampiric-bloodline',
            subTraitSlug: 'chaos/red-sprite',
            gear: {
              weapon: 'weapons/arcana/glass-bead',
              chest: 'armor/chest/battle-suit',
            },
          },
        })}
        variant="record"
      />,
    )

    const assetImgs = container.querySelectorAll(
      'img[src*="/assets/items/"], img[src*="/assets/loadout/"]',
    )
    expect(assetImgs.length).toBeGreaterThan(0)
    assetImgs.forEach((img) => {
      expect(img.className).toContain('object-contain')
      expect(img.className).not.toContain('object-cover')
    })
  })
})
