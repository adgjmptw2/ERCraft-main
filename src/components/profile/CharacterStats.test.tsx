import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CharacterAnalysisReport } from '@/analysis/types'
import { CharacterStats } from '@/components/profile/CharacterStats'

function report(overrides: Partial<CharacterAnalysisReport> = {}): CharacterAnalysisReport {
  return {
    characterNum: 19,
    characterName: '엠마',
    matchCount: 281,
    avgPlacement: 4,
    avgKills: 0,
    avgAssists: 0,
    avgTeamKills: null,
    avgDamageToPlayers: null,
    kda: 0,
    top3Rate: 49,
    winRate: 15,
    overallScore: null,
    status: 'ok',
    overallGrade: null,
    gradeLabel: '시즌',
    feedback: '공식 API 시즌 집계 기준입니다.',
    ...overrides,
  }
}

describe('CharacterStats', () => {
  it('real 시즌 집계 기준에서 API에 없는 상세 지표를 0.00으로 표시하지 않음', () => {
    render(
      <CharacterStats
        characterReports={[report({ avgKills: Number.NaN, kda: Number.NaN })]}
        userNum={1}
        seasonNumber={11}
        dataMode="real"
        basisSourceLabel="시즌 집계 기준"
      />,
    )

    expect(screen.queryByText('0.00')).not.toBeInTheDocument()
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(4)
  })

  it('real mode에서 백엔드 fine grade 표시', () => {
    render(
      <CharacterStats
        characterReports={[
          report({
            grade: 'A+',
            gradeStatus: 'ok',
            gradeSampleSize: 24,
            gradeBaselineTierKey: 'gold',
            gradeRole: '평타 브루저',
          }),
        ]}
        userNum={1}
        seasonNumber={11}
        dataMode="real"
      />,
    )

    expect(screen.getByText('A+')).toBeInTheDocument()
  })

  it('hideGrades가 켜지면 grade 컬럼과 placeholder를 표시하지 않음', () => {
    render(
      <CharacterStats
        characterReports={[
          report({
            grade: 'A+',
            gradeStatus: 'ok',
            gradeSampleSize: 24,
            gradeBaselineTierKey: 'gold',
            gradeRole: '평타 브루저',
          }),
        ]}
        userNum={1}
        seasonNumber={11}
        dataMode="real"
        hideGrades
      />,
    )

    expect(screen.queryByText('등급')).not.toBeInTheDocument()
    expect(screen.queryByText('A+')).not.toBeInTheDocument()
  })

  it('real 시즌 aggregate에 실제 상세 지표가 있으면 표시', () => {
    render(
      <CharacterStats
        characterReports={[
          report({
            avgKills: 2.9,
            avgAssists: 3.1,
            avgTeamKills: 2.9,
            avgDamageToPlayers: 13200,
            kda: 4.5,
          }),
        ]}
        userNum={1}
        seasonNumber={11}
        dataMode="real"
        basisSourceLabel="PlayerMatch 120경기 기준"
      />,
    )

    expect(screen.getByText('2.90')).toBeInTheDocument()
    expect(screen.getByText('4.50')).toBeInTheDocument()
    expect(screen.getByText('13,200')).toBeInTheDocument()
  })
})
