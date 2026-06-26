import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { buildRealPlayStyleAnalysisFromProductionAxes } from '@/analysis/realPlayStyleAnalysis'
import { buildAnalysisTabMeta } from '@/analysis/analysisTabMeta'
import { resolveCharacterStatsDisplayLabel } from '@/analysis/analysisTabViewModel'
import { AnalysisTabLayout } from '@/components/analysis/tab/AnalysisTabLayout'
import {
  getDemoAnalysisMatchesForSeason,
  getDemoAnalysisPopulationMatches,
  getDemoPlayStyleAnalysisForSeason,
  getDemoPlayStylePopulationMatchSets,
  getDemoPlayStyleTierPopulationMatchSets,
  getDemoPlayerAnalysisCharacterReportsForSeason,
  getDemoPlayerAnalysisReportForSeason,
} from '@/mocks/loader'
import type { CharacterAnalysisReport } from '@/analysis/types'
import type { MatchSummary } from '@/types/match'
import type { ProductionAnalysisAxesDTO, ProductionAnalysisAxisDTO } from '@/types/player'

function renderMineAnalysis() {
  return render(
    <AnalysisTabLayout
      nickname="마인"
      playStyleAnalysis={getDemoPlayStyleAnalysisForSeason('마인', 11, 'recent20')}
      analysisReport={getDemoPlayerAnalysisReportForSeason('마인', 11, 'recent20')}
      characterReports={getDemoPlayerAnalysisCharacterReportsForSeason('마인', 11, 'recent20')}
      analysisMatches={getDemoAnalysisMatchesForSeason('마인', 11, 'recent20')}
      populationMatchSets={getDemoPlayStylePopulationMatchSets(11, 'recent20')}
      tierPopulationMatchSets={getDemoPlayStyleTierPopulationMatchSets('마인', 11, 'recent20')}
      populationMatches={getDemoAnalysisPopulationMatches()}
      basisLabel="랭크 · 최근 20판 기준"
      analysisScope="recent20"
      showScopeToggle={false}
      onScopeChange={() => {}}
    />,
  )
}

function realMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: 'real-1',
    userNum: 1,
    characterNum: 11,
    characterName: '유키',
    placement: 3,
    kills: 4,
    deaths: 1,
    assists: 2,
    gameStartedAt: '2026-06-01T00:00:00Z',
    victory: false,
    gameMode: 'rank',
    damageToPlayers: 10000,
    teamKills: 7,
    animalKills: 8,
    gameDuration: 1000,
    credit: 700,
    visionScore: 40,
    ...overrides,
  }
}

const realCharacterReports: CharacterAnalysisReport[] = [
  {
    characterNum: 11,
    characterName: '유키',
    matchCount: 4,
    avgPlacement: 3,
    avgKills: 4,
    avgAssists: 2,
    avgTeamKills: 7,
    avgDamageToPlayers: 10000,
    kda: 6,
    top3Rate: 75,
    winRate: 25,
    overallScore: null,
    status: 'ok',
    overallGrade: null,
    gradeLabel: '시즌',
    feedback: '공식 API 시즌 집계 기준입니다.',
  },
]

function productionAxis(key: ProductionAnalysisAxisDTO, score: number) {
  const label = {
    survival: '생존',
    combat: '교전',
    macro: '운영',
    support: '지원',
    finish: '마무리',
    consistency: '일관성',
  }[key]
  return {
    axis: key,
    label,
    score,
    referenceScore: 65 as const,
    status: 'ready' as const,
    sampleCount: 4,
    components: [{
      metric: key,
      label,
      score,
      weight: 100,
      contribution: score,
      actualValue: null,
      expectedValue: null,
      ratio: null,
    }],
    description: `${label} production evidence`,
  }
}

function productionAxes(): ProductionAnalysisAxesDTO {
  return {
    version: 'production-analysis-axes.v1.1',
    metricPresetVersion: 'character-grade-production',
    scope: 'overall',
    sampleCount: 4,
    aggregationPolicy: 'production-overall-direct-match-mean',
    axes: [
      productionAxis('survival', 72),
      productionAxis('combat', 76),
      productionAxis('macro', 68),
      productionAxis('support', 70),
      productionAxis('finish', 74),
      productionAxis('consistency', 82),
    ],
  }
}

function productionPlayStyle() {
  return buildRealPlayStyleAnalysisFromProductionAxes({
    axes: productionAxes(),
    overallScore: 74,
    basisLabel: '최근 4경기',
  })
}

describe('AnalysisTabLayout', () => {
  it('마인 분석탭 — view model 기반 섹션 렌더', () => {
    renderMineAnalysis()

    expect(screen.getByText('핵심 요약')).toBeInTheDocument()
    expect(screen.getByText('플레이 레이더')).toBeInTheDocument()
    expect(screen.getByText('추정 역할군')).toBeInTheDocument()
    expect(screen.getByText('캐릭터 통계 · 대표 픽')).toBeInTheDocument()
    expect(screen.getByText('카테고리별 지표')).toBeInTheDocument()
    expect(screen.getByText(/ERCraft 자체 분석 기준/)).toBeInTheDocument()
    expect(screen.queryByText('최근 경기 표본이 부족해 역할군 추정을 보류합니다.')).not.toBeInTheDocument()
  })

  it('캐릭터 선택 시 6축·지표가 해당 캐릭터 기준으로 전환', () => {
    renderMineAnalysis()

    expect(screen.getByText('플레이 레이더')).toBeInTheDocument()

    const characterButton = screen.getAllByRole('button').find((button) =>
      button.textContent?.includes('경기 · 승률'),
    )
    expect(characterButton).toBeTruthy()
    fireEvent.click(characterButton!)

    expect(screen.getByText(/유키 · 플레이 레이더/)).toBeInTheDocument()
    expect(screen.getByText(/카테고리별 지표/)).toBeInTheDocument()
    expect(screen.getAllByText(/선택한 캐릭터의 최근 경기만 집계/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/· 유키/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { pressed: true })).toBe(characterButton)
  })

  it('대표 캐릭터 — CharacterAvatar characterNum 전달', () => {
    const { container } = renderMineAnalysis()

    const imgs = container.querySelectorAll('img[src*="/assets/characters/"]')
    expect(imgs.length).toBeGreaterThan(0)
    expect(imgs[0]?.getAttribute('src')).toMatch(/\/assets\/characters\/\d+\.webp/)
  })

  it('백분위·SSS 문구 미노출', () => {
    renderMineAnalysis()
    const text = document.body.textContent ?? ''

    expect(text).not.toMatch(/SSS/i)
    expect(text).not.toMatch(/상위\s*[\d.]+\s*%/)
    expect(text).not.toMatch(/샘플\s*상위/)
  })

  it('팀운 섹션 — 데이터 없으면 안내 문구', () => {
    renderMineAnalysis()

    expect(screen.getByText('팀운')).toBeInTheDocument()
    expect(
      screen.getByText('아직 계산 가능한 팀 데이터가 부족해요. 전적이 추가되면 자동으로 분석됩니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('팀운 미리보기')).not.toBeInTheDocument()
    expect(screen.queryByText('확장 예정 지표')).not.toBeInTheDocument()
  })

  it('개발 용어와 계산됨 배지 미노출', () => {
    renderMineAnalysis()
    const text = document.body.textContent ?? ''

    expect(text).not.toMatch(/production/i)
    expect(text).not.toMatch(/evidence/i)
    expect(text).not.toMatch(/\bready\b/i)
    expect(text).not.toMatch(/\bpartial\b/i)
    expect(screen.queryByText('계산됨')).not.toBeInTheDocument()
    expect(screen.queryByText(/계산 가능 지표/)).not.toBeInTheDocument()
  })

  it('real playStyleAnalysis — 6축 레이더 표시', () => {
    const matches = [
      realMatch({ matchId: 'r1', placement: 1, victory: true }),
      realMatch({ matchId: 'r2', placement: 3 }),
      realMatch({ matchId: 'r3', placement: 5, kills: 2, assists: 4 }),
      realMatch({ matchId: 'r4', placement: 2, victory: true, visionScore: 55 }),
    ]

    render(
      <AnalysisTabLayout
        nickname="실전유저"
        playStyleAnalysis={productionPlayStyle()}
        analysisReport={null}
        characterReports={realCharacterReports}
        analysisMatches={matches}
        populationMatchSets={[]}
        tierPopulationMatchSets={[]}
        populationMatches={[]}
        basisLabel="최근 경기 분석: 현재 로드된 4경기 기준"
        characterStatsBasisLabel="최근 4경기 기준"
        analysisScope="recent20"
        showScopeToggle={false}
        onScopeChange={() => {}}
      />,
    )

    expect(screen.getByText('플레이 레이더')).toBeInTheDocument()
    expect(screen.getByText('추정 역할군')).toBeInTheDocument()
    expect(screen.getByText(/실전유저 · 4경기 분석/)).toBeInTheDocument()
    expect(screen.getByText(/생존 · 교전 · 운영 · 지원 · 마무리 · 일관성/)).toBeInTheDocument()
    expect(screen.getByText(/캐릭터 통계: 최근 4경기 기준/)).toBeInTheDocument()
  })

  it('real playStyleAnalysis — 일부 값이 없어도 핵심 요약 렌더', () => {
    const matches = [
      realMatch({ matchId: 'r1', placement: 1, victory: true, damageToPlayers: undefined, visionScore: undefined }),
      realMatch({ matchId: 'r2', placement: 3, damageToPlayers: undefined, visionScore: undefined }),
      realMatch({ matchId: 'r3', placement: 5, kills: 2, assists: 4, animalKills: undefined }),
      realMatch({ matchId: 'r4', placement: 2, victory: true, credit: undefined }),
    ]

    render(
      <AnalysisTabLayout
        nickname="실전유저"
        playStyleAnalysis={productionPlayStyle()}
        analysisReport={null}
        characterReports={realCharacterReports}
        analysisMatches={matches}
        populationMatchSets={[]}
        tierPopulationMatchSets={[]}
        populationMatches={[]}
        basisLabel="최근 경기 분석: 현재 로드된 4경기 기준"
        characterStatsBasisLabel="최근 4경기 기준"
        analysisScope="recent20"
        showScopeToggle={false}
        onScopeChange={() => {}}
      />,
    )

    expect(screen.getByText('핵심 요약')).toBeInTheDocument()
    expect(screen.getAllByText('평균 순위').length).toBeGreaterThan(0)
  })

  it('표본 부족 — 레이더 대신 보류 상태와 캐릭터 empty state 표시', () => {
    render(
      <AnalysisTabLayout
        nickname="없음"
        playStyleAnalysis={null}
        analysisReport={null}
        characterReports={[]}
        analysisMatches={[]}
        populationMatchSets={[]}
        tierPopulationMatchSets={[]}
        populationMatches={[]}
        basisLabel="test"
        analysisScope="recent20"
        showScopeToggle={false}
        onScopeChange={() => {}}
      />,
    )

    expect(screen.getByText('분석 데이터 부족')).toBeInTheDocument()
    expect(screen.getByText('플레이 레이더')).toBeInTheDocument()
    expect(screen.getByText('추정 역할군')).toBeInTheDocument()
    expect(screen.getByText('분석 보류')).toBeInTheDocument()
    expect(screen.getByText('표본이 부족해 플레이스타일 분석을 보류했어요.')).toBeInTheDocument()
    expect(screen.getByText('캐릭터별 표본이 부족합니다')).toBeInTheDocument()
  })

  it('scope split — 헤더 기준과 중복되는 카드/하단 라벨을 줄인다', () => {
    const matches = [
      realMatch({ matchId: 'r1', placement: 1, victory: true }),
      realMatch({ matchId: 'r2', placement: 3 }),
      realMatch({ matchId: 'r3', placement: 5, kills: 2, assists: 4 }),
      realMatch({ matchId: 'r4', placement: 2, victory: true, visionScore: 55 }),
    ]
    const meta = buildAnalysisTabMeta({
      seasonAggregate: {
        userNum: 1,
        seasonId: 11,
        apiSeasonId: 11,
        cacheStatus: 'ready',
        isRefreshing: false,
        characterStats: [],
        rpSeries: [],
        lastRefreshedAt: '2026-06-01T00:00:00.000Z',
        backfillProgress: {
          status: 'complete',
          officialSeasonGames: 808,
          collectedGames: 808,
        },
        coverage: {
          officialSeasonGames: 808,
          collectedGames: 808,
          characterCount: 1,
          rpPointCount: 1,
          coverageRatio: 1,
        },
      },
      statsDto: null,
      recentMatchCount: matches.length,
      characterStatsSource: 'aggregate',
    })

    render(
      <AnalysisTabLayout
        nickname="실전유저"
        playStyleAnalysis={productionPlayStyle()}
        analysisReport={null}
        characterReports={realCharacterReports}
        analysisMatches={matches}
        populationMatchSets={[]}
        tierPopulationMatchSets={[]}
        populationMatches={[]}
        basisLabel="시즌 전체 랭크 경기 기준"
        characterStatsBasisLabel="수집된 경기 기준 · 백그라운드 보강 중"
        analysisTabMeta={meta}
        analysisScope="recent20"
        showScopeToggle={false}
        onScopeChange={() => {}}
      />,
    )

    expect(screen.getByText(/시즌 데이터/)).toBeInTheDocument()
    expect(screen.getAllByText(/플레이 경향/).length).toBeGreaterThan(0)
    expect(screen.getByText(/표본 808전/)).toBeInTheDocument()
    expect(screen.getByText(/계산 가능한 주요 지표/)).toBeInTheDocument()
    expect(screen.queryByText(/최근 4경기 기준 주요 지표/)).not.toBeInTheDocument()
    expect(screen.queryByText(/캐릭터 통계:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/시즌:.*경향:/)).not.toBeInTheDocument()
    expect(
      resolveCharacterStatsDisplayLabel('수집된 경기 기준 · 백그라운드 보강 중', true),
    ).toBeNull()
  })
})
