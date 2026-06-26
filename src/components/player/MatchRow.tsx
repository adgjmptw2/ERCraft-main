import { useState, type ReactNode } from 'react'

import { resolveVerifiedGearItemSlug } from '@/assets/itemAssetMap'
import {
  GEAR_ITEM_INNER_IMG_CLASS,
  GEAR_ITEM_INNER_WRAPPER_CLASS,
} from '@/components/shared/GameAssetIcon'
import { GearItemInfoTrigger } from '@/components/player/GearItemInfoTrigger'
import { MatchDetailExpandPanel } from '@/components/player/MatchDetailExpandPanel'
import { useMatchDetail } from '@/hooks/useMatchDetail'
import { useMatchDetailPendingPhase } from '@/hooks/useMatchDetailPendingPhase'
import { isRealMode } from '@/api/erClient'
import { MatchGearSlotGrid, MatchLoadoutSlotGrid } from '@/components/player/MatchEquipmentStrip'
import {
  MatchSparkleChip,
  MatchVictorySparkleParticles,
} from '@/components/player/MatchVictorySparkleDecor'
import { MATCH_HIGHLIGHT_LEVEL_CLASS } from '@/utils/matchHighlight'

import {
  resolveCobaltInfusion,
} from '@/assets/cobaltInfusionMap'
import { CharacterAvatar } from '@/components/shared'
import { GameAssetIcon } from '@/components/shared/GameAssetIcon'
import { IconLevelBadge } from '@/components/shared/IconLevelBadge'

import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

import type { MatchSummaryDTO, TeamPerformance } from '@/types/match'

import {

  formatMatchNumber,

  formatRpDelta,

  matchGradeBackgroundColor,

  matchGradeColor,

} from '@/utils/matchDemoStats'

import { equipmentGradeBgClass } from '@/utils/equipmentItemGrade'
import { isCobaltGameMode, isGradeSupportedGameMode, isRankGameMode } from '@/utils/gameMode'

import type { CharacterFineGrade } from '@/utils/characterGrade'
import { getMatchHighlight } from '@/utils/matchHighlight'

/** PC 통계 — 딜량(만자리)·RP(백자리) 기준 고정 열 너비·간격 (자릿수 달라도 동일) */
const DESKTOP_MATCH_STAT_GAP = 'gap-x-[10px]'
const DESKTOP_MATCH_STAT_COL_WIDTH = {
  damage: 'w-[3.5rem]',
  rp: 'w-[2.25rem]',
  grade: 'w-9',
  teamPerformance: 'w-[8.75rem]',
} as const

/** TK/K/A 10의 자리 기준 고정 — 장비 슬롯 위치가 KDA 자릿수에 흔들리지 않음 */
const MATCH_TK_STAT_COLS = 'grid-cols-[1.5rem_auto_1.5rem_auto_1.5rem]'
const MATCH_TK_BLOCK_W = 'w-[6.25rem] min-w-[6.25rem] max-w-[6.25rem]'
/** pl-3(12) + TK(100) + 간격(16) */
const MATCH_DESKTOP_GEAR_LEFT = 'left-[8rem]'
const MATCH_DESKTOP_TK_GEAR_STRIP_W = 'w-[15.5rem]'
const MATCH_MOBILE_TK_LEFT = 'left-[50px]'
const MATCH_MOBILE_TK_BLOCK_W = 'w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem]'
/** 로드아웃(50) + TK(88) + 간격(30) */
const MATCH_MOBILE_GEAR_LEFT = 'left-[168px]'
const MATCH_MOBILE_ROW_W = 'w-[292px]'

export interface MatchRowProps {

  match: MatchSummaryDTO

  variant?: 'default' | 'record'

}

interface PlacementRowStyle {

  borderColor: string

  rankColor: string

}



function placementRowBgClass(placement: number): string {

  if (placement === 1) {

    return 'border-border/60 bg-[rgba(34,197,94,0.10)] dark:bg-[rgba(34,197,94,0.08)]'

  }



  if (placement >= 2 && placement <= 3) {

    return 'border-border/60 bg-[rgba(96,165,250,0.10)] dark:bg-[rgba(96,165,250,0.06)]'

  }



  return 'border-border/80 bg-card dark:border-border/60 dark:bg-transparent'

}



function placementRowStyle(placement: number): PlacementRowStyle {

  if (placement === 1) {

    return {

      borderColor: '#22c55e',

      rankColor: '#22c55e',

    }

  }



  if (placement >= 2 && placement <= 3) {

    return {

      borderColor: '#60a5fa',

      rankColor: '#60a5fa',

    }

  }



  return {

    borderColor: 'var(--border)',

    rankColor: 'var(--muted-foreground)',

  }

}

function formatNullableMatchNumber(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '-' : formatMatchNumber(value)
}

function formatNullablePlainNumber(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '-' : String(value)
}

function formatEvidenceNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return value.toLocaleString('ko-KR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function durationPolicyLabel(policy: string): string {
  switch (policy) {
    case 'blend-legacy-to-global':
      return '8~10분 경기 시간 기준'
    case 'global':
      return '10~20분 경기 시간 기준'
    case 'blend-global-to-legacy':
      return '20~25분 경기 시간 기준'
    case 'legacy-duration-multiplier':
      return '기존 경기 시간 기준'
    default:
      return '경기 시간 기준'
  }
}

function metricEvidenceLabel(metric: string): string {
  switch (metric) {
    case 'damage':
      return '피해'
    case 'combatContribution':
      return '교전 기여'
    case 'survival':
      return '생존'
    case 'vision':
      return '시야'
    case 'monster':
      return '야생동물'
    default:
      return metric
  }
}

function metricAdjustmentLabel(policy: string): string {
  switch (policy) {
    case 'unadjusted':
      return '기본 반영'
    case 'severe-low-1.00':
      return '큰 약점 반영'
    case 'mild-low-0.75':
      return '약점 완화'
    case 'neutral':
      return '평균 수준'
    case 'strength-1.20':
      return '강점 반영'
    case 'exceptional-strength-1.35':
    case 'clamped-max-95':
      return '뚜렷한 강점 반영'
    case 'clamped-min-30':
      return '큰 약점 반영'
    default:
      return '지표 반영'
  }
}

function formatSignedPerformanceDelta(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '데이터 부족'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
}

function compactCarryBurdenLabel(label: string | null): string | null {
  if (!label) return null
  if (label === '매우 높은 캐리 부담') return '매우 높음'
  if (label === '높은 캐리 부담') return '높음'
  if (label === '낮은 캐리 부담') return '낮음'
  if (label === '팀원 성과 우세') return '팀원 우세'
  return label
}

function comparisonScopeLabel(level: TeamPerformance['fallbackLevel']): string {
  if (level === 'L0') return '같은 조건 기준'
  if (level === 'L1' || level === 'L2') return '유사 조건 기준'
  return '넓은 경기군 기준'
}

function comparisonScopeDescription(level: TeamPerformance['fallbackLevel']): string {
  if (level === 'L0') {
    return '같은 실험체·무기·순위·경기 시간대 기록과 비교했어요.'
  }
  if (level === 'L1' || level === 'L2') {
    return '같은 조건의 기록이 충분하지 않아 비슷한 조건의 경기까지 함께 비교했어요.'
  }
  return '같은 조건의 기록이 충분하지 않아 순위와 경기 시간이 비슷한 더 넓은 경기들을 함께 비교했어요.'
}

function teamFlowDescription(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '팀원 기록을 아직 충분히 비교하지 못했어요.'
  if (value >= 15) return '팀원들은 비슷한 경기의 평균보다 훨씬 잘했어요.'
  if (value >= 5) return '팀원들은 비슷한 경기의 평균보다 조금 잘했어요.'
  if (value > -5) return '팀원들은 비슷한 경기의 평균과 비슷했어요.'
  if (value > -15) return '팀원들은 비슷한 경기의 평균보다 조금 아쉬웠어요.'
  return '팀원들은 비슷한 경기의 평균보다 많이 아쉬웠어요.'
}

function carryBalanceDescription(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '내 플레이와 팀원들의 차이를 아직 비교하지 못했어요.'
  const abs = Math.abs(value)
  if (abs < 7) return '내 플레이와 팀원들의 차이가 크지 않았어요.'
  if (value > 0) return '내가 팀원 평균보다 더 많은 몫을 해냈어요.'
  return '팀원들이 내 평균 대비 더 앞섰어요.'
}

function teamLuckDisplayParts(
  match: MatchSummaryDTO,
): { icon: string; label: string } | null {
  const teamPerformance = match.teamPerformance
  if (!isRankGameMode(match.gameMode) || !teamPerformance) return null
  const label = teamPerformance.teamLuckLabel ?? teamPerformance.teammatePerformanceLabel
  if (label === '최상') return { icon: '☀', label }
  if (label === '좋음') return { icon: '🌤', label }
  if (label === '보통') return { icon: '⛅', label }
  if (label === '나쁨') return { icon: '☁', label }
  if (label === '최악') return { icon: '🌧', label }
  return null
}

function shouldShowTeamPerformance(match: MatchSummaryDTO): boolean {
  return isRankGameMode(match.gameMode)
}

function formatTeamLuckDisplay(match: MatchSummaryDTO): string | null {
  if (!isRankGameMode(match.gameMode)) return null
  const parts = teamLuckDisplayParts(match)
  return parts ? `${parts.icon} ${parts.label}` : '미집계'
}

function MatchDetailToggleIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-3 w-5 overflow-visible"
      viewBox="0 0 20 12"
      fill="none"
    >
      <path
        d={open ? 'M3 8.5L10 3.5L17 8.5' : 'M3 3.5L10 8.5L17 3.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}



function MatchStatSlashGrid({
  teamKill,
  kills,
  assists,
  className,
  variant = 'default',
}: {
  teamKill: number | null
  kills: number
  assists: number
  className?: string
  variant?: 'default' | 'mobile'
}) {
  if (variant === 'mobile') {
    const mobileStatCols = cn('grid', MATCH_TK_STAT_COLS, 'gap-x-px text-center')

    return (
      <div className={cn('leading-none tabular-nums', className)}>
        <div className={cn(mobileStatCols, 'text-[14px]')}>
          <span className="text-stat-value font-bold">{formatNullablePlainNumber(teamKill)}</span>
          <span className="text-border dark:text-muted-foreground">/</span>
          <span className="text-stat-value font-bold">{kills}</span>
          <span className="text-border dark:text-muted-foreground">/</span>
          <span className="text-stat-value font-bold">{assists}</span>
        </div>
        <div
          className={cn(
            'text-muted-foreground mt-0.5 font-semibold dark:font-normal',
            mobileStatCols,
            'text-[10px]',
          )}
        >
          <span>TK</span>
          <span className="text-border dark:text-muted-foreground">/</span>
          <span>K</span>
          <span className="text-border dark:text-muted-foreground">/</span>
          <span>A</span>
        </div>
      </div>
    )
  }

  const desktopStatCols = cn('grid', MATCH_TK_STAT_COLS, 'gap-x-1 text-center')

  return (
    <div className={cn('leading-none tabular-nums', className)}>
      <div className={cn(desktopStatCols, 'text-[13px]')}>
        <span className="text-stat-value font-bold">{formatNullablePlainNumber(teamKill)}</span>
        <span className="text-border dark:text-muted-foreground">/</span>
        <span className="text-stat-value font-bold">{kills}</span>
        <span className="text-border dark:text-muted-foreground">/</span>
        <span className="text-stat-value font-bold">{assists}</span>
      </div>
      <div
        className={cn(
          'text-muted-foreground mt-0.5 font-semibold dark:font-normal',
          desktopStatCols,
          'text-[11px]',
        )}
      >
        <span>TK</span>
        <span className="text-border dark:text-muted-foreground">/</span>
        <span>K</span>
        <span className="text-border dark:text-muted-foreground">/</span>
        <span>A</span>
      </div>
    </div>
  )
}



function RowDot() {

  return <span className="text-muted-foreground shrink-0 px-0.5">·</span>

}



function ColDivider({ className }: { className?: string }) {

  return (

    <div className={cn('bg-border/70 mx-px w-px shrink-0 self-stretch', className)} />

  )

}



function StatColumn({

  label,

  children,

  className,

  colWidth,

}: {

  label: string

  children: ReactNode

  className?: string

  colWidth?: string

}) {

  return (

    <div
      className={cn(
        'flex min-w-0 flex-col justify-center gap-px leading-none',
        colWidth,
        className,
      )}
    >

      <span className="text-label text-xs">{label}</span>

      {children}

    </div>

  )

}



function CobaltInfusionIcons({
  infusions,
  size = 'sm',
}: {
  infusions?: number[]
  size?: 'sm' | 'md'
}) {
  const slots = infusions?.filter((code) => Number.isFinite(code) && code > 0).slice(0, 3) ?? []
  if (slots.length === 0) {
    return <span className="text-muted-foreground text-xs font-medium">-</span>
  }
  return (
    <div className="flex items-center -space-x-1.5">
      {slots.map((code, index) => {
        const resolved = resolveCobaltInfusion(code)
        if (!resolved) return null
        const { nameKo: label, assetPath: iconUrl, isKnown } = resolved
        if (iconUrl) {
          return (
            <GameAssetIcon
              key={`${code}-${index}`}
              src={iconUrl}
              label={label}
              size={size === 'md' ? 'lg' : size}
              shape="circle"
            />
          )
        }
        return (
          <span
            key={`${code}-${index}`}
            className="text-muted-foreground inline-flex h-7 min-w-7 max-w-[5.5rem] items-center justify-center px-1.5 text-[10px] font-medium tabular-nums"
            title={label}
          >
            {isKnown ? (
              <span className="truncate">{label}</span>
            ) : (
              code
            )}
          </span>
        )
      })}
    </div>
  )
}



function MatchRecordStats({

  match,

  grade,

  showsRp,

  showsCobaltInfusions,

  cobaltInfusions,

  rpPositive,

  rpDisplay,

  layout,

  className,

}: {

  match: MatchSummaryDTO

  grade: CharacterFineGrade | null

  showsRp: boolean

  showsCobaltInfusions: boolean

  cobaltInfusions?: number[]

  rpPositive: boolean

  rpDisplay: string

  layout: 'desktop' | 'mobile-inline'

  className?: string

}) {

  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const showsTeamPerformance = shouldShowTeamPerformance(match)
  const teamLuckDisplay = formatTeamLuckDisplay(match)

  if (layout === 'mobile-inline') {

    return (

      <div

        className={cn(

          'border-border/60 text-foreground flex flex-wrap items-center gap-x-7 gap-y-0.5 border-t pt-1 text-xs leading-snug',

          className,

        )}

      >

        <span className="tabular-nums">

          <span className="text-muted-foreground">딜량: </span>

          <span className="font-bold">{formatNullableMatchNumber(match.playerDamage)}</span>

        </span>

        {showsCobaltInfusions ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground shrink-0">인퓨전: </span>
            <CobaltInfusionIcons infusions={cobaltInfusions} size="md" />
          </span>
        ) : (
          <>
            <span className="tabular-nums">
              <span className="text-muted-foreground">RP: </span>
              <span
                className={cn(
                  'font-bold',
                  !showsRp && 'text-muted-foreground',
                  showsRp && rpPositive && 'text-green-500',
                  showsRp && !rpPositive && 'text-muted-foreground',
                )}
              >
                {rpDisplay}
              </span>
            </span>

            <span className="tabular-nums">
              <span className="text-muted-foreground">등급: </span>
              <span
                className={cn('font-bold', !grade && 'text-muted-foreground')}
                style={grade ? { color: matchGradeColor(grade) } : undefined}
              >
                {match.matchGrade ?? '-'}
              </span>
            </span>
          </>
        )}

        {showsTeamPerformance && teamLuckDisplay ? (
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">팀운: </span>
            <span className="font-medium">
              {teamLuckDisplay}
            </span>
          </span>
        ) : null}

      </div>

    )

  }



  return (

    <div
      className={cn(
        'flex shrink-0 items-center justify-start',
        DESKTOP_MATCH_STAT_GAP,
        className,
      )}
    >

      <StatColumn
        label="딜량"
        colWidth={DESKTOP_MATCH_STAT_COL_WIDTH.damage}
        className="shrink-0"
      >

        <span className="text-stat-value text-[13px] font-bold tabular-nums">

          {formatNullableMatchNumber(match.playerDamage)}

        </span>

      </StatColumn>



      {showsCobaltInfusions ? (
        <StatColumn
          label="인퓨전"
          colWidth="w-[5.5rem]"
          className="shrink-0"
        >
          <CobaltInfusionIcons infusions={cobaltInfusions} size="md" />
        </StatColumn>
      ) : (
        <>
          <StatColumn
            label="RP"
            colWidth={DESKTOP_MATCH_STAT_COL_WIDTH.rp}
            className="shrink-0"
          >
            <span
              className={cn(
                'text-[13px] font-bold tabular-nums',
                !showsRp && 'text-muted-foreground',
                showsRp && rpPositive && 'text-green-500',
                showsRp && !rpPositive && 'text-muted-foreground',
              )}
            >
              {rpDisplay}
            </span>
          </StatColumn>

          <StatColumn
            label="등급"
            colWidth={DESKTOP_MATCH_STAT_COL_WIDTH.grade}
            className="shrink-0"
          >
            <span
              className="inline-flex w-fit rounded px-1 py-0.5 text-[13px] font-bold tabular-nums"
              style={grade ? {
                color: matchGradeColor(grade),
                backgroundColor: matchGradeBackgroundColor(grade, isDark),
              } : undefined}
            >
              {match.matchGrade ?? '-'}
            </span>
          </StatColumn>
        </>
      )}



      {!showsCobaltInfusions ? (
        <StatColumn
          label="팀운"
          colWidth={DESKTOP_MATCH_STAT_COL_WIDTH.teamPerformance}
          className="shrink-0"
        >
          {showsTeamPerformance && teamLuckDisplay ? (
            <span className="text-stat-value truncate text-[12px] font-medium leading-none">
              {teamLuckDisplay}
            </span>
          ) : (
            <span className="invisible text-[12px]" aria-hidden="true">
              empty
            </span>
          )}
        </StatColumn>
      ) : null}

    </div>

  )

}



function MatchTeamLuckDetail({ match }: { match: MatchSummaryDTO }) {
  const teamPerformance = match.teamPerformance
  const teamLuckDisplay = formatTeamLuckDisplay(match)
  if (!isRankGameMode(match.gameMode) || !teamPerformance || !teamLuckDisplay) return null
  const teamLuckValue = teamPerformance.teamLuckResidual ?? teamPerformance.teammatePerformanceScore
  const ownValue = teamPerformance.ownResidual ?? teamPerformance.ownPerformanceScore
  const teammateValue = teamPerformance.teammateResidualAverage ?? teamPerformance.teammatePerformanceScore
  const carryValue = teamPerformance.carryBurdenResidual ?? teamPerformance.carryBurdenDelta
  const scopeLabel = comparisonScopeLabel(teamPerformance.fallbackLevel)

  return (
    <div className="border-border/60 bg-muted/30 border-t px-3 py-2 text-xs dark:bg-black/5">
      <p className="text-muted-foreground leading-relaxed">
        함께 플레이한 팀원들의 실제 경기 성과를 바탕으로 표시한 값입니다.
      </p>
      {teamPerformance.status === 'partial' ? (
        <p className="text-foreground mt-2 rounded-md bg-amber-500/10 px-2 py-1 font-semibold text-amber-700 dark:text-amber-300">
          팀원 1명의 기록만 반영되어 결과가 달라질 수 있어요.
        </p>
      ) : null}
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 tabular-nums sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">팀운</dt>
          <dd className="text-foreground font-semibold">{teamLuckDisplay}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">평균 대비</dt>
          <dd className="text-foreground font-semibold">
            {formatSignedPerformanceDelta(teamLuckValue)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">내 플레이 평균 대비</dt>
          <dd className="text-foreground font-semibold">
            {formatSignedPerformanceDelta(ownValue)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">팀원 평균 대비</dt>
          <dd className="text-foreground font-semibold">
            {formatSignedPerformanceDelta(teammateValue)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">캐리 균형</dt>
          <dd className="text-foreground font-semibold">
            {compactCarryBurdenLabel(teamPerformance.carryBurdenLabel) ?? '데이터 부족'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">팀원과의 차이</dt>
          <dd className="text-foreground font-semibold">
            {formatSignedPerformanceDelta(carryValue)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">반영된 팀원</dt>
          <dd className="text-foreground font-semibold">
            팀원 {teamPerformance.gradedTeammateCount}명 반영
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">비교 범위</dt>
          <dd className="text-foreground font-semibold">{scopeLabel}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <dt className="text-muted-foreground">해석</dt>
          <dd className="text-foreground font-semibold">
            {teamFlowDescription(teamLuckValue)} {carryBalanceDescription(carryValue)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">비교에 사용한 경기</dt>
          <dd className="text-foreground font-semibold">
            {teamPerformance.sampleCount != null ? `${teamPerformance.sampleCount}건` : '집계 중'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">기준 설명</dt>
          <dd className="text-foreground font-semibold">{comparisonScopeDescription(teamPerformance.fallbackLevel)}</dd>
        </div>
      </dl>
    </div>
  )
}

function MatchDamageGradeDetail({ match }: { match: MatchSummaryDTO }) {
  const evidence = match.matchGradeDamageEvidence
  if (!isGradeSupportedGameMode(match.gameMode) || !evidence) return null

  return (
    <div className="border-border/60 bg-muted/20 border-t px-3 py-2 text-xs dark:bg-black/5">
      <p className="text-muted-foreground leading-relaxed">
        피해는 같은 티어·실험체·무기 기준 피해량에 경기 시간 배율을 곱해 비교합니다.
      </p>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 tabular-nums sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-muted-foreground">실제 피해</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.actualDamage, 0)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">기준 피해</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.baselineDamage, 0)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">시간 반영 기준</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.expectedDamage, 0)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">피해 비율</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.damageRatio, 2)}x</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">피해 점수</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.adjustedMetricScore ?? evidence.damageScore, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">기본 평가점수</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.rawMetricScore, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">강점·약점 반영</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.adjustedMetricScore, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">이전 시간 기준</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.oldMultiplier, 3)}x</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">최종 시간 기준</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.finalMultiplier, 3)}x</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">가중 기여</dt>
          <dd className="text-foreground font-semibold">{formatEvidenceNumber(evidence.adjustedWeightedContribution ?? evidence.weightedContribution, 1)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">시간 정책</dt>
          <dd className="text-foreground font-semibold">{durationPolicyLabel(evidence.durationPolicy)}</dd>
        </div>
      </dl>
      {match.matchGradeMetricEvidence?.length ? (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
          {match.matchGradeMetricEvidence.map((metric) => (
            <div key={metric.metric} className="rounded border border-border/50 px-2 py-1">
              <p className="text-muted-foreground font-semibold">{metricEvidenceLabel(metric.metric)}</p>
              <p className="text-foreground font-semibold">
                기본 {formatEvidenceNumber(metric.rawMetricScore, 1)} → {metricAdjustmentLabel(metric.adjustmentPolicy)}{' '}
                {formatEvidenceNumber(metric.adjustedMetricScore, 1)}
              </p>
              <p className="text-muted-foreground">
                기여 {formatEvidenceNumber(metric.adjustedWeightedContribution, 1)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}



function MatchRecordRow({ match }: { match: MatchSummaryDTO }) {

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailFetchRequested, setDetailFetchRequested] = useState(false)
  const detailQuery = useMatchDetail(match.matchId, detailFetchRequested && isRealMode())
  const pendingPhase = useMatchDetailPendingPhase(detailOpen && detailQuery.isPending)

  const style = placementRowStyle(match.placement)

  const grade = isGradeSupportedGameMode(match.gameMode)
    ? (match.matchGrade as CharacterFineGrade | null)
    : null

  const rpPositive = (match.rpDeltaValue ?? 0) > 0

  const showsRp = isRankGameMode(match.gameMode)

  const showsCobaltInfusions = isCobaltGameMode(match.gameMode)

  const rpDisplay = showsRp && match.rpDeltaValue != null ? formatRpDelta(match.rpDeltaValue) : '-'

  const highlight = getMatchHighlight(match.placement, grade)



  return (

    <article

      className={cn(

        'relative min-h-0 overflow-hidden rounded-lg border border-l-[3px] md:min-h-[90px]',

        placementRowBgClass(match.placement),

        highlight.level !== 'none' && MATCH_HIGHLIGHT_LEVEL_CLASS[highlight.level],

      )}

      style={{

        borderLeftColor: style.borderColor,

      }}

    >

      <MatchVictorySparkleParticles level={highlight.level} />

      <div className="px-2 py-1.5 pr-7 md:px-2 md:py-3 md:pr-6">

        <div className="flex min-w-0 items-center justify-between gap-1.5 pb-0.5 md:pb-1">

          <div className="text-muted-foreground flex min-w-0 flex-wrap items-center text-xs leading-none sm:text-[10px]">

            <span className="font-bold tabular-nums" style={{ color: style.rankColor }}>

              #{match.placement}

            </span>

            <RowDot />

            <span>{match.gameModeLabel}</span>

            <RowDot />

            <span className="tabular-nums">{match.gameDurationLabel}</span>

            <RowDot />

            <span className="leading-none">{match.relativeTime}</span>

          </div>

          <div className="flex shrink-0 items-center gap-1.5">

            <MatchSparkleChip highlight={highlight} />

            <span className="text-muted-foreground text-xs leading-none tabular-nums md:text-[10px]">

              {match.routeLabel}

            </span>

          </div>

        </div>



        <div className="min-w-0">

          <div className="space-y-1 md:hidden">

            <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-2.5">

              <div className="flex w-[3.5rem] flex-col items-center gap-px">

                <div className="relative shrink-0">

                <CharacterAvatar

                  characterNum={match.characterNum}

                  skinCode={match.skinCode}

                  characterName={match.characterName}

                  size="lg"

                  className="border-border border bg-transparent"

                />

                <IconLevelBadge level={match.characterLevel} size="sm" />

              </div>

              <p className="text-muted-foreground w-full truncate text-center text-[10px] leading-none">

                {match.characterName}

              </p>

              </div>

              <div className={cn('relative h-[52px] shrink-0', MATCH_MOBILE_ROW_W)}>
                <div className="absolute top-1/2 left-0 -translate-y-1/2">
                  <MatchLoadoutSlotGrid
                    preview={match.equipmentPreview}
                    iconSize="sm"
                    tacticalSkillGroup={match.tacticalSkillGroup}
                    cobaltLayout={showsCobaltInfusions}
                  />
                </div>

                <div
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2',
                    MATCH_MOBILE_TK_LEFT,
                    MATCH_MOBILE_TK_BLOCK_W,
                  )}
                >
                  <MatchStatSlashGrid
                    teamKill={match.teamKill}
                    kills={match.kills}
                    assists={match.assists}
                    variant="mobile"
                  />
                </div>

                <div
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 space-y-0.5',
                    MATCH_MOBILE_GEAR_LEFT,
                  )}
                  aria-label="장비"
                >
                  {(
                    [
                      [
                        {
                          slug: match.equipmentPreview?.gear?.weapon,
                          grade: match.equipmentPreview?.gearGrade?.weapon,
                          label: '무기',
                        },
                        {
                          slug: match.equipmentPreview?.gear?.chest,
                          grade: match.equipmentPreview?.gearGrade?.chest,
                          label: '상의',
                        },
                        {
                          slug: match.equipmentPreview?.gear?.head,
                          grade: match.equipmentPreview?.gearGrade?.head,
                          label: '모자',
                        },
                      ],
                      [
                        {
                          slug: match.equipmentPreview?.gear?.arm,
                          grade: match.equipmentPreview?.gearGrade?.arm,
                          label: '팔',
                        },
                        {
                          slug: match.equipmentPreview?.gear?.leg,
                          grade: match.equipmentPreview?.gearGrade?.leg,
                          label: '신발',
                        },
                      ],
                    ] as const
                  ).map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      className={cn(
                        'flex gap-0.5',
                        rowIndex === 1 && 'ml-[21px]', // (40px + 2px) / 2
                      )}
                    >
                      {row.map((slot) => {
                        const verified = resolveVerifiedGearItemSlug(slot.slug)
                        const iconUrl = verified ? `/assets/items/${verified}.webp` : null
                        return (
                          <GearItemInfoTrigger
                            key={slot.label}
                            slug={slot.slug}
                            grade={slot.grade}
                            slotLabel={slot.label}
                            className={cn(
                              'text-muted-foreground relative block h-6 w-10 rounded-[3px] text-[8px] font-medium',
                              equipmentGradeBgClass(slot.grade) ??
                                'border-border/50 bg-muted/60 border',
                            )}
                          >
                            {iconUrl ? (
                              <div className={GEAR_ITEM_INNER_WRAPPER_CLASS}>
                                <img
                                  src={iconUrl}
                                  alt=""
                                  className={GEAR_ITEM_INNER_IMG_CLASS}
                                  loading="lazy"
                                />
                              </div>
                            ) : (
                              <span className="flex h-full items-center justify-center">·</span>
                            )}
                          </GearItemInfoTrigger>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>

            </div>



            <MatchRecordStats

              layout="mobile-inline"

              match={match}

              grade={grade}

              showsRp={showsRp}

              showsCobaltInfusions={showsCobaltInfusions}

              cobaltInfusions={match.cobaltInfusions}

              rpPositive={rpPositive}

              rpDisplay={rpDisplay}

            />

          </div>



          <div className="hidden w-full min-w-0 items-center justify-between gap-2 md:flex">

            <div className="flex min-w-0 shrink-0 items-center">

              <div className="flex w-[124px] shrink-0 items-start gap-1.5">

                <div className="w-[54px] shrink-0">

                  <div className="relative">

                    <CharacterAvatar

                      characterNum={match.characterNum}

                      skinCode={match.skinCode}

                      characterName={match.characterName}

                      size="lg"

                      className="border-border border bg-transparent"

                    />

                    <IconLevelBadge level={match.characterLevel} />

                  </div>

                  <p className="text-muted-foreground mt-0.5 text-center text-[10px] leading-none">

                    {match.characterName}

                  </p>

                </div>

                <MatchLoadoutSlotGrid
                  preview={match.equipmentPreview}
                  tacticalSkillGroup={match.tacticalSkillGroup}
                  cobaltLayout={showsCobaltInfusions}
                />

              </div>



              <ColDivider />



              <div
                className={cn(
                  'relative h-[58px] shrink-0',
                  MATCH_DESKTOP_TK_GEAR_STRIP_W,
                )}
              >
                <div
                  className={cn(
                    'absolute top-1/2 left-0 -translate-y-1/2 pl-3',
                    MATCH_TK_BLOCK_W,
                  )}
                >
                  <MatchStatSlashGrid
                    teamKill={match.teamKill}
                    kills={match.kills}
                    assists={match.assists}
                  />
                </div>

                <div
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2',
                    MATCH_DESKTOP_GEAR_LEFT,
                  )}
                >
                  <MatchGearSlotGrid preview={match.equipmentPreview} />
                </div>
              </div>

            </div>



            <div className="flex shrink-0 items-center gap-2">
              <ColDivider className="shrink-0" />

              <MatchRecordStats
                layout="desktop"
                match={match}
                grade={grade}
                showsRp={showsRp}
                showsCobaltInfusions={showsCobaltInfusions}
                cobaltInfusions={match.cobaltInfusions}
                rpPositive={rpPositive}
                rpDisplay={rpDisplay}
              />
            </div>

          </div>

        </div>

      </div>



      <button

        type="button"

        className={cn(
          'absolute top-[3.5rem] right-2 flex size-5 shrink-0 -translate-y-1/2 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          detailOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}

        aria-expanded={detailOpen}

        aria-label={detailOpen ? '매치 상세 접기' : '매치 상세 펼치기'}

        onClick={() => {
          setDetailOpen((open) => {
            if (!open) {
              setDetailFetchRequested(true)
            }
            return !open
          })
        }}

      >

        <MatchDetailToggleIcon open={detailOpen} />

      </button>



      {detailOpen ? (
        <>
          <MatchTeamLuckDetail match={match} />
          <MatchDamageGradeDetail match={match} />
          {isRealMode() ? (
            <MatchDetailExpandPanel
              gameId={match.matchId}
              detail={detailQuery.data}
              isPending={detailQuery.isPending}
              pendingPhase={pendingPhase}
              isError={detailQuery.isError}
              error={detailQuery.error}
              onRetry={() => {
                void detailQuery.refetch()
              }}
            />
          ) : (
            <div className="border-border/60 bg-muted/40 flex h-16 items-center justify-center border-t dark:bg-black/5">
              <p className="text-muted-foreground text-xs">데모 모드 — 실 API 연결 후 매치 상세를 확인할 수 있습니다.</p>
            </div>
          )}
        </>
      ) : null}

    </article>

  )

}



export function MatchRow({ match, variant = 'default' }: MatchRowProps) {

  if (variant === 'record') {

    return (

      <li className="min-w-0">

        <MatchRecordRow match={match} />

      </li>

    )

  }



  const style = placementRowStyle(match.placement)



  return (

    <li className="min-w-0">

      <article

        className={cn(

          'overflow-hidden rounded-lg border border-l-[3px] p-3',

          placementRowBgClass(match.placement),

        )}

        style={{

          borderLeftColor: style.borderColor,

        }}

      >

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-xs">

          <span className="font-bold tabular-nums" style={{ color: style.rankColor }}>

            #{match.placement}

          </span>

          <RowDot />

          <span className="tabular-nums">{match.gameDurationLabel}</span>

          <RowDot />

          <span>{match.relativeTime}</span>

        </div>

      </article>

    </li>

  )

}
