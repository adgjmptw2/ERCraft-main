import { useMemo, useState } from 'react'

import type { AnalysisGrade, CharacterAnalysisReport } from '@/analysis/types'
import { CharacterAvatar, Skeleton } from '@/components/shared'
import {
  fineGradeColor,
  getDemoCharacterFineGrade,
  type CharacterFineGrade,
} from '@/utils/characterGrade'
import { resolveCharacterDisplayName } from '@/utils/characterMap'
import { profileCharacterStatsBasisLabel } from '@/utils/characterStatsFromMatches'
import { cn } from '@/lib/utils'

const VISIBLE_DEFAULT = 10

type CharacterStatsTabId = 'all'

const TABS: { id: CharacterStatsTabId; label: string }[] = [{ id: 'all', label: '전체' }]

const COLUMN_HEADER_CLASS =
  'text-muted-foreground px-0.5 text-[9px] font-semibold uppercase tracking-wide'

function FineGradeBadge({ grade, title }: { grade: CharacterFineGrade; title?: string }) {
  return (
    <span
      className="inline-flex min-w-8 shrink-0 items-center justify-center whitespace-nowrap rounded px-0.5 py-0.5 text-xs font-bold tabular-nums"
      style={{ color: fineGradeColor(grade), backgroundColor: `${fineGradeColor(grade)}18` }}
      title={title}
      aria-label={title ? `${grade} 등급 — ${title}` : `${grade} 등급`}
    >
      {grade}
    </span>
  )
}

function buildRealGradeTitle(char: CharacterAnalysisReport): string | undefined {
  const parts: string[] = []
  if (char.gradeBaselineTierKey) parts.push(`기준 티어 ${char.gradeBaselineTierKey}`)
  if (char.gradeSampleSize != null && char.gradeSampleSize > 0) {
    parts.push(`표본 ${char.gradeSampleSize}경기`)
  }
  if (char.gradeAggregation) {
    const finalScore = char.gradeAggregation.finalScore
    const ordinaryMean = char.gradeAggregation.ordinaryMean
    if (char.gradeAggregation.aggregationPolicy === 'robust-weighted-10pct') {
      parts.push('10경기 이상 극단 경기 영향 완화 적용')
      if (ordinaryMean != null) parts.push(`보정 전 일반 평균 ${ordinaryMean.toFixed(2)}`)
      if (finalScore != null) parts.push(`최종 집계점수 ${finalScore.toFixed(2)}`)
    } else {
      if (ordinaryMean != null) parts.push(`일반 평균 ${ordinaryMean.toFixed(2)}`)
      if (finalScore != null) parts.push(`최종 집계점수 ${finalScore.toFixed(2)}`)
    }
  }
  if (char.gradeRole) parts.push(char.gradeRole)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

const ANALYSIS_GRADE_COLOR: Record<AnalysisGrade[0], string> = {
  S: '#f59e0b',
  A: '#38bdf8',
  B: '#a3e635',
  C: '#f97316',
  D: '#94a3b8',
}

function ReferenceGradeBadge({ label }: { label: string }) {
  const gradeToken = label.split(' ')[0]?.split('·')[0]?.trim() as AnalysisGrade | undefined
  const gradeHead = gradeToken?.[0] as AnalysisGrade[0] | undefined
  const color = gradeHead && ANALYSIS_GRADE_COLOR[gradeHead] ? ANALYSIS_GRADE_COLOR[gradeHead] : '#94a3b8'

  return (
    <span
      className="inline-flex min-w-8 shrink-0 items-center justify-center whitespace-nowrap rounded px-0.5 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{ color, backgroundColor: `${color}18` }}
    >
      {label}
    </span>
  )
}

function characterRowKey(char: CharacterAnalysisReport): string {
  if (char.characterNum != null && char.characterNum > 0) return `num:${char.characterNum}`
  return `name:${char.characterName}`
}

function formatAvgStat(value: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toFixed(digits)
}

function formatRpTotal(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-'
  if (value > 0) return `+${value.toLocaleString('ko-KR')}`
  return value.toLocaleString('ko-KR')
}

function rpTotalClass(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'text-stat-value'
  if (value > 0) return 'text-red-400'
  if (value < 0) return 'text-sky-400'
  return 'text-stat-value'
}

function formatDamage(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '-'
  return Math.round(value).toLocaleString('ko-KR')
}

export interface CharacterStatsProps {
  characterReports: CharacterAnalysisReport[]
  userNum: number
  seasonNumber: number
  dataMode?: 'mock' | 'real'
  basisMatchCount?: number
  basisSourceLabel?: string
  refreshNotice?: string
  refreshPending?: boolean
  onRefreshAggregate?: () => void
  isPending?: boolean
  canLoadMoreMatches?: boolean
  loadMoreMatchesPending?: boolean
  loadMoreMatchesError?: string | null
  onLoadMoreMatches?: () => void
  hideGrades?: boolean
  className?: string
}

export function CharacterStats({
  characterReports,
  userNum,
  seasonNumber,
  dataMode = 'mock',
  basisMatchCount,
  basisSourceLabel,
  refreshNotice,
  refreshPending = false,
  onRefreshAggregate,
  isPending = false,
  canLoadMoreMatches = false,
  loadMoreMatchesPending = false,
  loadMoreMatchesError = null,
  onLoadMoreMatches,
  hideGrades = false,
  className,
}: CharacterStatsProps) {
  const [expanded, setExpanded] = useState(false)
  const activeTab: CharacterStatsTabId = 'all'

  const sorted = useMemo(
    () => [...characterReports].sort((a, b) => b.matchCount - a.matchCount),
    [characterReports],
  )

  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_DEFAULT)
  const canExpand = sorted.length > VISIBLE_DEFAULT

  const basisLabel =
    dataMode === 'real'
      ? (basisSourceLabel ??
        (basisMatchCount != null && basisMatchCount > 0
          ? profileCharacterStatsBasisLabel(basisMatchCount)
          : null))
      : null

  return (
    <div className={cn('space-y-3', className)}>
      {basisLabel ? (
        <p className="text-muted-foreground text-[10px] leading-none">{basisLabel}</p>
      ) : null}
      {dataMode === 'real' && refreshNotice ? (
        <div
          className="border-border/60 bg-muted/20 text-muted-foreground rounded-md border px-2 py-2 text-[10px] leading-snug"
          role="status"
        >
          <p>{refreshNotice}</p>
          {onRefreshAggregate ? (
            <button
              type="button"
              disabled={refreshPending}
              onClick={onRefreshAggregate}
              className="text-primary hover:text-primary/80 mt-1 text-[10px] font-semibold underline-offset-4 hover:underline disabled:opacity-50"
            >
              {refreshPending ? '집계 확인 중…' : '집계 다시 확인'}
            </button>
          ) : null}
        </div>
      ) : null}
      {dataMode === 'real' && canLoadMoreMatches ? (
        <p className="text-muted-foreground text-[10px] leading-snug">
          추가 경기 불러오기로 표본을 늘릴 수 있습니다.
        </p>
      ) : null}
      {loadMoreMatchesError ? (
        <p className="text-destructive text-[10px]" role="alert">
          {loadMoreMatchesError}
        </p>
      ) : null}
      {dataMode === 'real' && canLoadMoreMatches && onLoadMoreMatches ? (
        <button
          type="button"
          disabled={loadMoreMatchesPending}
          onClick={onLoadMoreMatches}
          className="text-muted-foreground hover:text-foreground border-border/70 w-full rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {loadMoreMatchesPending ? '추가 경기 불러오는 중…' : '추가 경기 불러오기'}
        </button>
      ) : null}
      <nav className="border-border/60 border-b" aria-label="캐릭터 통계 모드">
        <div className="flex gap-4">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  'text-muted-foreground hover:text-foreground -mb-px border-b-2 pb-2 text-xs font-semibold transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                  isActive ? 'border-primary text-foreground' : 'border-transparent',
                )}
                aria-selected={isActive}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>

      {isPending ? (
        <div className="space-y-2 py-1" aria-busy="true" aria-label="캐릭터 통계 로딩">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-md" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">
          {dataMode === 'real' ? '데이터 없음' : '캐릭터 데이터 없음'}
        </p>
      ) : (
        <>
          <div className="w-full overflow-x-hidden">
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: '36%' }} />
                <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: hideGrades ? '29%' : '19%' }} />
              {!hideGrades ? <col style={{ width: '10%' }} /> : null}
              </colgroup>
              <thead>
                <tr className="bg-muted/25 border-border/60 border-y">
                  <th className="py-1.5 text-left" scope="col" aria-label="캐릭터" />
                  <th className={cn(COLUMN_HEADER_CLASS, 'text-right')} scope="col">
                    승률
                  </th>
                  <th className={cn(COLUMN_HEADER_CLASS, 'text-right')} scope="col">
                    RP
                  </th>
                  <th className={cn(COLUMN_HEADER_CLASS, 'text-right')} scope="col">
                    TK/KDA
                  </th>
                  <th className={cn(COLUMN_HEADER_CLASS, 'text-right')} scope="col">
                    평균딜량
                  </th>
                  {!hideGrades ? (
                    <th className={cn(COLUMN_HEADER_CLASS, 'text-center')} scope="col">
                      등급
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {visible.map((char) => {
                  const showRealGrade = dataMode === 'real' && char.grade != null
                  const showReferenceGrade =
                    dataMode === 'real' &&
                    !showRealGrade &&
                    char.status === 'ok' &&
                    char.gradeLabel !== '-'
                  const showInsufficient =
                    dataMode === 'real' &&
                    !showRealGrade &&
                    (char.gradeStatus === 'insufficient-sample' || char.status === 'insufficient-sample')
                  const showPartialData =
                    dataMode === 'real' && !showRealGrade && char.gradeStatus === 'partial-data'
                  const showMissingBaseline =
                    dataMode === 'real' &&
                    !showRealGrade &&
                    !showReferenceGrade &&
                    char.gradeStatus === 'missing-baseline'

                  const displayName = resolveCharacterDisplayName(char.characterNum, char.characterName)
                  return (
                    <tr key={characterRowKey(char)} className="hover:bg-muted/35 transition-colors">
                      <td className="py-1.5 pr-0.5">
                        <div className="flex min-w-0 items-center gap-1">
                          <CharacterAvatar
                            characterNum={char.characterNum}
                            characterName={displayName}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-stat-value text-xs leading-tight font-semibold break-keep">
                              {displayName}
                            </p>
                            <p className="text-muted-foreground tabular-nums text-[10px]">
                              {char.matchCount}게임
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-0.5 py-1.5 text-right">
                        <p className="text-muted-foreground tabular-nums text-[10px] font-medium leading-none">
                          {char.winRate.toFixed(0)}%
                        </p>
                      </td>
                      <td className="px-0.5 py-1.5 text-right">
                        <p
                          className={cn(
                            'tabular-nums text-[10px] font-medium leading-none',
                            rpTotalClass(char.totalRpDelta),
                          )}
                        >
                          {formatRpTotal(char.totalRpDelta)}
                        </p>
                      </td>
                      <td className="px-0.5 py-1.5 text-right">
                        <p className="tabular-nums whitespace-nowrap text-[10px] leading-none">
                          <span className="text-sky-400 text-[8px] font-semibold">TK</span>{' '}
                          <span className="text-stat-value text-[10px] font-semibold">
                            {formatAvgStat(char.avgTeamKills)}
                          </span>
                        </p>
                        <p className="tabular-nums mt-0.5 whitespace-nowrap text-[10px] leading-none">
                          <span className="text-muted-foreground text-[8px] font-semibold">KDA</span>{' '}
                          <span className="text-muted-foreground text-[10px] font-medium">
                            {formatAvgStat(char.kda)}
                          </span>
                        </p>
                      </td>
                      <td className="px-0.5 py-1.5 text-right">
                        <p className="text-stat-value tabular-nums text-[11px] font-semibold leading-none">
                          {formatDamage(char.avgDamageToPlayers)}
                        </p>
                      </td>
                      {!hideGrades ? (
                        <td className="overflow-visible px-0 py-1.5 text-center">
                          {dataMode === 'mock' ? (
                            <FineGradeBadge
                              grade={getDemoCharacterFineGrade(userNum, seasonNumber, char.characterName)}
                            />
                          ) : showRealGrade ? (
                            <FineGradeBadge grade={char.grade!} title={buildRealGradeTitle(char)} />
                          ) : showReferenceGrade ? (
                            <ReferenceGradeBadge label={char.gradeLabel} />
                          ) : showInsufficient ? (
                            <span className="text-muted-foreground text-[10px] font-medium">표본-</span>
                          ) : showPartialData ? (
                            <span className="text-muted-foreground text-[10px] font-medium">집계중</span>
                          ) : showMissingBaseline ? (
                            <span
                              className="text-muted-foreground text-[10px] font-medium"
                              title="등급 기준 티어가 반영되지 않았습니다. 집계 다시 확인을 눌러 갱신해 주세요."
                            >
                              티어-
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">-</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {canExpand ? (
            <button
              type="button"
              className="text-primary hover:text-primary/80 text-xs font-medium underline-offset-4 hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '접기' : `더 보기 (${sorted.length - VISIBLE_DEFAULT}개)`}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
