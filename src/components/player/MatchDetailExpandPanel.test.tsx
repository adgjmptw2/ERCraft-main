import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MatchDetailExpandPanel } from '@/components/player/MatchDetailExpandPanel'
import { MATCH_GEAR_CROSS_GRID_CLASS, MATCH_LOADOUT_COMPACT_GRID_CLASS } from '@/components/player/MatchEquipmentStrip'
import {
  MATCH_DETAIL_COMPACT_ROW_CLASS,
  MATCH_DETAIL_PARTICIPANT_COLS_CLASS,
  MATCH_DETAIL_PARTICIPANT_DESKTOP_ROW_CLASS,
  MATCH_DETAIL_TABLE_CLASS,
} from '@/components/player/matchDetailParticipantLayout'
import type { MatchDetailDTO, MatchParticipantDetail } from '@/types/matchDetail'

function getDesktopTeamGrid(teamNumber: number): HTMLElement {
  const section = screen.getByLabelText(`팀 ${teamNumber}`)
  const grid = section.querySelector('.match-detail-team-block')
  expect(grid).toBeTruthy()
  return grid as HTMLElement
}

function getCompactRowByNickname(nickname: string): HTMLElement {
  const nicknameEl = document.querySelector(
    `.match-detail-compact-player-nickname[title="${nickname}"]`,
  )
  expect(nicknameEl).toBeTruthy()
  const row = nicknameEl?.closest(`.${MATCH_DETAIL_COMPACT_ROW_CLASS}`)
  expect(row).toBeTruthy()
  return row as HTMLElement
}

function makeParticipant(
  overrides: Partial<MatchParticipantDetail> & Pick<MatchParticipantDetail, 'participantId' | 'placement'>,
): MatchParticipantDetail {
  return {
    characterNum: 1,
    kills: 5,
    deaths: 2,
    assists: 8,
    nickname: '플레이어',
    characterName: '유키',
    characterLevel: 19,
    damageToPlayer: 13975,
    damageToMonster: 107963,
    credit: 1450,
    teamKills: 12,
    visionScore: 42,
    gameMode: 'normal',
    ...overrides,
  }
}

function makeDetail(overrides?: Partial<MatchDetailDTO>): MatchDetailDTO {
  const participants = Array.from({ length: 21 }, (_, index) => {
    const teamNumber = Math.floor(index / 3) + 1
    const placement = index + 1
    return makeParticipant({
      participantId: `p-${placement}`,
      placement,
      teamNumber,
      teamRank: teamNumber,
      nickname:
        placement === 7
          ? 'VeryLongNicknameThatShouldNotBreakCompactLayoutABCDEFG'
          : placement === 8
            ? '日本語ニックネームテストユーザー'
            : `참가자${placement}`,
      kills: placement,
      deaths: 1,
      assists: placement + 2,
      damageToPlayer: 10000 + placement * 1111,
    })
  })

  const teams = Array.from({ length: 7 }, (_, teamIndex) => {
    const teamNumber = teamIndex + 1
    return {
      teamNumber,
      teamRank: teamNumber,
      participants: participants.slice(teamIndex * 3, teamIndex * 3 + 3),
    }
  })

  return {
    gameId: '61718605',
    gameMode: 'normal',
    playedAt: '2026-06-18T10:00:00+09:00',
    detailStatus: 'ready',
    teams,
    ...overrides,
  }
}

describe('MatchDetailExpandPanel participant rows', () => {
  it('한 팀의 참가자 3명이 세로로 순서대로 렌더된다', () => {
    const { container } = render(
      <MatchDetailExpandPanel gameId="61718605" detail={makeDetail()} isPending={false} isError={false} />,
    )

    expect(screen.getByText(/경기 #61718605 · 팀 7 · 참가자 21명/)).toBeInTheDocument()
    expect(container.querySelectorAll('.lg\\:grid-cols-3')).toHaveLength(0)
    expect(container.querySelectorAll('.min-\\[520px\\]\\:grid-cols-2')).toHaveLength(0)

    const teamOneSection = screen.getByLabelText('팀 1')
    const rows = teamOneSection.querySelectorAll(`.${MATCH_DETAIL_PARTICIPANT_DESKTOP_ROW_CLASS}`)
    expect(rows).toHaveLength(3)
    expect(teamOneSection.textContent).toMatch(/참가자1[\s\S]*참가자2[\s\S]*참가자3/)
  })

  it('공통 header가 한 번 표시되고 참가자 행에는 긴 라벨이 반복되지 않는다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'solo',
                  placement: 1,
                  nickname: '하잉',
                  kills: 5,
                  deaths: 2,
                  assists: 8,
                  damageToPlayer: 13975,
                  damageToMonster: 107963,
                  credit: 1450,
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'KDA' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '피해' })).toBeInTheDocument()
    const desktopTeam = getDesktopTeamGrid(1)
    expect(within(desktopTeam).getByText('5/2/8')).toBeInTheDocument()
    expect(within(desktopTeam).getByText('13,975')).toBeInTheDocument()
    expect(within(desktopTeam).getByText('107,963')).toBeInTheDocument()
    expect(within(desktopTeam).getByText('1,450')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader', { name: 'KDA' })).toHaveLength(1)
    expect(screen.queryByText('받은 피해')).not.toBeInTheDocument()
  })

  it('긴 닉네임은 title로 전체 확인 가능하다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'long',
                  placement: 1,
                  nickname: 'VeryLongNicknameThatShouldNotBreakCompactLayoutABCDEFG',
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const nickname = within(getDesktopTeamGrid(1)).getByText(
      'VeryLongNicknameThatShouldNotBreakCompactLayoutABCDEFG',
    )
    expect(nickname).toHaveAttribute(
      'title',
      'VeryLongNicknameThatShouldNotBreakCompactLayoutABCDEFG',
    )
    expect(nickname.className).toMatch(/truncate/)
  })

  it('비코발트 경기에서는 인퓨전 header와 column이 없다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({ gameMode: 'rank' })}
        isPending={false}
        isError={false}
      />,
    )

    expect(screen.queryByRole('columnheader', { name: '인퓨전' })).not.toBeInTheDocument()
    const desktopTeam = getDesktopTeamGrid(1)
    expect(within(desktopTeam).queryByLabelText('코발트 인퓨전')).not.toBeInTheDocument()
    expect(within(desktopTeam).queryByText(/^-$/, { selector: '[role="cell"]' })).toBeNull()
  })

  it('코발트 경기에서만 인퓨전 header가 표시된다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          gameMode: 'cobalt',
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'cobalt-header',
                  placement: 1,
                  gameMode: 'cobalt',
                  cobaltInfusions: [13],
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    expect(screen.getByRole('columnheader', { name: '인퓨전', hidden: true })).toBeInTheDocument()
  })

  it('참가자 레벨 배지와 티어·RP를 표시한다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'ranked',
                  placement: 1,
                  nickname: '랭커',
                  characterLevel: 20,
                  rpAfter: 5077,
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const desktopTeam = getDesktopTeamGrid(1)
    expect(within(desktopTeam).getByLabelText('레벨 20')).toBeInTheDocument()
    expect(within(desktopTeam).getByText(/5,077 RP/)).toBeInTheDocument()
    expect(within(desktopTeam).queryByText(/Lv\.20/)).not.toBeInTheDocument()
  })

  it('무기·특성 아이콘이 2×2 grid로 렌더된다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'loadout',
                  placement: 1,
                  tacticalSkillGroup: 171,
                  bestWeapon: 1,
                  traitFirstCore: 1,
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const desktopTeam = getDesktopTeamGrid(1)
    expect(desktopTeam.querySelector(`.${MATCH_LOADOUT_COMPACT_GRID_CLASS}`)).toBeTruthy()
  })

  it('코발트 인퓨전 이름-only·fallback·code0 제외를 렌더한다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          gameMode: 'cobalt',
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'cobalt',
                  placement: 1,
                  gameMode: 'cobalt',
                  nickname: '코발트유저',
                  cobaltInfusions: [13, 63, 27, 0, 10001],
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const teamSection = screen.getByLabelText('팀 1')
    expect(within(teamSection).getAllByLabelText('코발트 인퓨전').length).toBeGreaterThanOrEqual(1)
    expect(within(teamSection).getAllByTitle('쿨다운 감소').length).toBeGreaterThan(0)
    expect(within(teamSection).getAllByTitle('디스코').length).toBeGreaterThan(0)
    expect(within(teamSection).getAllByTitle('인퓨전 27').length).toBeGreaterThan(0)
    expect(screen.queryByTitle('인퓨전 0')).not.toBeInTheDocument()
    expect(screen.queryByText('10001')).not.toBeInTheDocument()
  })

  it('장비가 3+2 교차형으로 렌더되고 하단 2개가 가운데 정렬된다', () => {
    const { container } = render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'gear',
                  placement: 1,
                  nickname: '장비유저',
                  equipment: {
                    weapon: 101,
                    chest: 102,
                    head: 103,
                    arm: 104,
                    leg: 105,
                  },
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const desktopTeam = getDesktopTeamGrid(1)
    const gearGrid = within(desktopTeam).getByLabelText('장비')
    expect(gearGrid).toHaveClass(MATCH_GEAR_CROSS_GRID_CLASS)
    expect(gearGrid.querySelectorAll('[data-gear-slot]')).toHaveLength(5)
    expect(container.querySelector('.match-gear-compact-row')).toBeNull()
    expect(gearGrid.querySelector('[data-gear-slot="arm"]')?.parentElement?.className).toMatch(
      /col-start-2/,
    )
    expect(gearGrid.querySelector('[data-gear-slot="leg"]')?.parentElement?.className).toMatch(
      /col-start-4/,
    )
  })

  it('빈 장비 슬롯이 있어도 3+2 배열 폭과 정렬이 유지된다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'partial-gear',
                  placement: 1,
                  nickname: '부분장비',
                  equipment: {
                    weapon: 101,
                    chest: 102,
                    leg: 105,
                  },
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const gearGrid = within(getDesktopTeamGrid(1)).getByLabelText('장비')
    expect(gearGrid.querySelectorAll('[data-gear-slot]')).toHaveLength(5)
    expect(gearGrid.querySelector('[data-gear-slot="head"]')).toBeTruthy()
    expect(gearGrid.querySelector('[data-gear-slot="arm"]')?.parentElement?.className).toMatch(
      /col-start-2/,
    )
  })

  it('header와 participant row가 동일한 column template을 사용한다', () => {
    const { container } = render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          gameMode: 'cobalt',
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'align',
                  placement: 1,
                  gameMode: 'cobalt',
                  cobaltInfusions: [13],
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const table = container.querySelector(`.${MATCH_DETAIL_TABLE_CLASS}`)
    expect(table).toBeTruthy()

    const headerCols = container.querySelector(
      `[role="row"] .${MATCH_DETAIL_PARTICIPANT_COLS_CLASS}`,
    )
    const rowCols = container.querySelector(`.${MATCH_DETAIL_PARTICIPANT_DESKTOP_ROW_CLASS}`)
    expect(headerCols).toBeTruthy()
    expect(rowCols).toBeTruthy()
    expect(headerCols?.className).toContain(MATCH_DETAIL_PARTICIPANT_COLS_CLASS)
    expect(rowCols?.className).toContain(MATCH_DETAIL_PARTICIPANT_COLS_CLASS)

    const headerChildren = headerCols?.children.length ?? 0
    const rowChildren = rowCols?.children.length ?? 0
    expect(headerChildren).toBe(rowChildren)
  })

  it('팀 rowspan 셀에 순위와 팀 번호가 표시된다', () => {
    const { container } = render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          teams: [
            {
              teamNumber: 2,
              teamRank: 1,
              participants: [
                makeParticipant({ participantId: 'a', placement: 1, nickname: 'A' }),
                makeParticipant({ participantId: 'b', placement: 2, nickname: 'B' }),
                makeParticipant({ participantId: 'c', placement: 3, nickname: 'C' }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const rowHeader = container.querySelector('[role="rowheader"]')
    expect(rowHeader?.textContent).toContain('#1')
    expect(rowHeader?.textContent).toContain('팀2')
  })

  it('compact row는 닉네임·티어·RP 두 줄과 중앙 지표를 사용한다', () => {
    render(
      <MatchDetailExpandPanel
        gameId="61718605"
        detail={makeDetail({
          teams: [
            {
              teamNumber: 1,
              teamRank: 1,
              participants: [
                makeParticipant({
                  participantId: 'compact',
                  placement: 1,
                  nickname: '하잉',
                  teamKills: 20,
                  kills: 1,
                  deaths: 1,
                  assists: 13,
                  damageToPlayer: 11889,
                  damageToMonster: 47137,
                  visionScore: 1391,
                  rpAfter: 5077,
                }),
              ],
            },
          ],
        })}
        isPending={false}
        isError={false}
      />,
    )

    const row = getCompactRowByNickname('하잉')
    expect(within(row).getByText(/5,077 RP/)).toBeInTheDocument()
    expect(within(row).queryByText(/크레딧/)).not.toBeInTheDocument()
    expect(within(row).queryByText(/피해 11,889/)).not.toBeInTheDocument()
    expect(within(row).getByLabelText('전투 지표')).toBeInTheDocument()
    const tkCells = within(row).getAllByTitle('팀 킬')
    expect(tkCells[tkCells.length - 1]?.textContent).toContain('20')
    const kdaCells = within(row).getAllByTitle('K/D/A')
    expect(kdaCells[kdaCells.length - 1]?.textContent).toContain('1/1/13')
    const damageCells = within(row).getAllByTitle('플레이어 피해')
    expect(damageCells[damageCells.length - 1]?.textContent).toContain('11,889')
    const monsterCells = within(row).getAllByTitle('야생동물 피해')
    expect(monsterCells[monsterCells.length - 1]?.textContent).toContain('47,137')
    const visionCells = within(row).getAllByTitle('시야 점수')
    expect(visionCells[visionCells.length - 1]?.textContent).toContain('1,391')
    expect(within(row).getByLabelText('장비')).toBeInTheDocument()
    expect(row.querySelector('.match-detail-compact-player-tier')).toBeTruthy()
    expect(row.querySelector('.match-detail-compact-player-nickname')).toBeTruthy()
  })

  it('pending/error 상태는 기존 메시지를 유지한다', () => {
    const { rerender } = render(
      <MatchDetailExpandPanel gameId="61718605" isPending pendingPhase="queued" isError={false} />,
    )
    expect(screen.getByText(/대기 중/)).toBeInTheDocument()

    rerender(
      <MatchDetailExpandPanel
        gameId="61718605"
        isPending={false}
        isError
        error={new Error('network')}
        onRetry={() => undefined}
      />,
    )
    expect(screen.getByText(/매치 상세 처리 중 문제가 발생했습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
