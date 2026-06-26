import { CharacterAvatar } from '@/components/shared/CharacterAvatar'
import { GameAssetIcon } from '@/components/shared/GameAssetIcon'
import { IconLevelBadge } from '@/components/shared/IconLevelBadge'
import {
  MatchGearCrossGrid,
  MatchLoadoutCompactGrid,
} from '@/components/player/MatchEquipmentStrip'
import {
  MATCH_DETAIL_COMPACT_GEAR_CLASS,
  MATCH_DETAIL_COMPACT_METRICS_CLASS,
  MATCH_DETAIL_COMPACT_PLAYER_CLASS,
  MATCH_DETAIL_COMPACT_ROW_CLASS,
  MATCH_DETAIL_PARTICIPANT_COLS_CLASS,
  MATCH_DETAIL_PARTICIPANT_DESKTOP_ROW_CLASS,
  MATCH_DETAIL_PARTICIPANT_MOBILE_ROW_CLASS,
  MATCH_DETAIL_PARTICIPANT_ROW_CLASS,
} from '@/components/player/matchDetailParticipantLayout'
import { resolveCobaltInfusion } from '@/assets/cobaltInfusionMap'
import { cn } from '@/lib/utils'
import type { MatchParticipantDetail } from '@/types/matchDetail'
import { mapGameToEquipmentPreview } from '@/utils/equipmentPreviewMapper'
import { formatMatchNumber } from '@/utils/matchDemoStats'
import { formatParticipantTierRpLine } from '@/utils/participantTierRp'

function formatStat(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return formatMatchNumber(value)
}

function useParticipantPreview(participant: MatchParticipantDetail) {
  return mapGameToEquipmentPreview({
    bestWeapon: participant.bestWeapon ?? undefined,
    tacticalSkillGroup: participant.tacticalSkillGroup ?? undefined,
    traitFirstCore: participant.traitFirstCore ?? undefined,
    traitFirstSub: participant.traitFirstSub,
    traitSecondSub: participant.traitSecondSub,
    equipment: participant.equipment,
    equipmentGrade: participant.equipmentGrade,
  })
}

function ParticipantInfusions({ codes, compact }: { codes: number[]; compact?: boolean }) {
  const slots = codes.filter((code) => Number.isFinite(code) && code > 0).slice(0, 3)
  if (slots.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-nowrap items-center -space-x-1',
        compact ? 'justify-start' : 'justify-end',
      )}
      aria-label="코발트 인퓨전"
    >
      {slots.map((code, index) => {
        const resolved = resolveCobaltInfusion(code)
        if (!resolved) return null
        const { nameKo: label, assetPath: iconUrl } = resolved
        return (
          <span
            key={`${code}-${index}`}
            className="inline-flex max-w-[2rem] shrink-0 items-center"
            title={label}
          >
            {iconUrl ? (
              <GameAssetIcon
                src={iconUrl}
                label={label}
                className={cn('shrink-0', compact ? 'size-4' : 'size-[1.125rem]')}
                decorative={false}
              />
            ) : (
              <span className="max-w-[1.75rem] truncate text-[8px] leading-none">{label}</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

function ParticipantPlayerCell({
  participant,
  equipmentPreview,
  displaySeasonId,
  cobaltLayout,
}: {
  participant: MatchParticipantDetail
  equipmentPreview: ReturnType<typeof mapGameToEquipmentPreview>
  displaySeasonId?: number | null
  cobaltLayout: boolean
}) {
  const nickname = participant.nickname?.trim() || '—'
  const characterName = participant.characterName ?? `실험체 #${participant.characterNum}`
  const tierRpLine = formatParticipantTierRpLine(participant.rpAfter, displaySeasonId)

  return (
    <div className="flex min-w-0 items-center gap-1.5 py-0.5">
      <div className="relative shrink-0" title={characterName}>
        <CharacterAvatar
          characterNum={participant.characterNum}
          skinCode={participant.skinCode ?? undefined}
          characterName={participant.characterName ?? undefined}
          className="size-9"
        />
        <IconLevelBadge level={participant.characterLevel} />
      </div>
      <div className="min-w-0 flex flex-1 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <p
            className="text-foreground min-w-0 flex-1 truncate text-xs leading-tight font-semibold"
            title={nickname}
          >
            {nickname}
          </p>
          <MatchLoadoutCompactGrid
            preview={equipmentPreview}
            size="desktop"
            cobaltLayout={cobaltLayout}
          />
        </div>
        <p className="text-muted-foreground truncate text-[10px] leading-tight" title={tierRpLine}>
          {tierRpLine}
        </p>
      </div>
    </div>
  )
}

function CompactMetricSlot({
  label,
  value,
  title,
  slotIndex,
}: {
  label: string
  value: string
  title: string
  slotIndex: number
}) {
  return (
    <>
      <div
        className={cn('match-detail-compact-metric-slot', 'match-detail-compact-metric-label text-center')}
        style={{ gridColumn: slotIndex, gridRow: 1 }}
        title={title}
      >
        {label}
      </div>
      <div
        className={cn('match-detail-compact-metric-slot', 'match-detail-compact-metric-value text-foreground text-center')}
        style={{ gridColumn: slotIndex, gridRow: 2 }}
        title={title}
      >
        {value}
      </div>
    </>
  )
}

export interface CompactMatchParticipantProps {
  participant: MatchParticipantDetail
  showInfusions: boolean
  displaySeasonId?: number | null
}

export function CompactMatchParticipant({
  participant,
  showInfusions,
  displaySeasonId,
}: CompactMatchParticipantProps) {
  const equipmentPreview = useParticipantPreview(participant)
  const kda = `${participant.kills}/${participant.deaths}/${participant.assists}`
  const infusionCodes = participant.cobaltInfusions ?? []
  const cobaltLayout = showInfusions

  return (
    <div
      className={cn(
        MATCH_DETAIL_PARTICIPANT_DESKTOP_ROW_CLASS,
        MATCH_DETAIL_PARTICIPANT_ROW_CLASS,
        MATCH_DETAIL_PARTICIPANT_COLS_CLASS,
        'hover:bg-muted/15 border-border/25 border-t py-1.5 first:border-t-0',
      )}
      role="row"
    >
      <div className="min-w-0 px-0.5" role="cell">
        <ParticipantPlayerCell
          participant={participant}
          equipmentPreview={equipmentPreview}
          displaySeasonId={displaySeasonId}
          cobaltLayout={cobaltLayout}
        />
      </div>
      <div className="text-foreground px-0.5 text-right text-[11px] tabular-nums" role="cell" title="K/D/A">
        {kda}
      </div>
      <div className="text-foreground px-0.5 text-right text-[11px] tabular-nums" role="cell" title="플레이어 피해">
        {formatStat(participant.damageToPlayer)}
      </div>
      <div
        className="match-detail-col-wild text-foreground hidden px-0.5 text-right text-[11px] tabular-nums @[680px]/match-detail:block"
        role="cell"
        title="야생동물 피해"
      >
        {formatStat(participant.damageToMonster)}
      </div>
      <div
        className="match-detail-col-credit text-foreground hidden px-0.5 text-right text-[11px] tabular-nums @[540px]/match-detail:block"
        role="cell"
        title="크레딧"
      >
        {formatStat(participant.credit)}
      </div>
      <div className="flex min-w-0 justify-center px-0.5" role="cell">
        <MatchGearCrossGrid preview={equipmentPreview} size="desktop" />
      </div>
      {showInfusions ? (
        <div className="hidden min-w-0 px-0.5 @[760px]/match-detail:block" role="cell">
          {infusionCodes.length > 0 ? (
            <ParticipantInfusions codes={infusionCodes} />
          ) : (
            <span className="text-muted-foreground text-[10px] tabular-nums">-</span>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function CompactMatchParticipantMobile({
  participant,
  showInfusions,
  displaySeasonId,
}: {
  participant: MatchParticipantDetail
  showInfusions: boolean
  displaySeasonId?: number | null
}) {
  const equipmentPreview = useParticipantPreview(participant)
  const nickname = participant.nickname?.trim() || '—'
  const kda = `${participant.kills}/${participant.deaths}/${participant.assists}`
  const tierRpLine = formatParticipantTierRpLine(participant.rpAfter, displaySeasonId)
  const characterName = participant.characterName ?? `실험체 #${participant.characterNum}`
  const infusionCodes = participant.cobaltInfusions ?? []
  const cobaltLayout = showInfusions

  return (
    <div
      className={cn(
        MATCH_DETAIL_COMPACT_ROW_CLASS,
        MATCH_DETAIL_PARTICIPANT_MOBILE_ROW_CLASS,
        MATCH_DETAIL_PARTICIPANT_ROW_CLASS,
        'hover:bg-muted/15 border-border/25 border-t px-0.5 py-px first:border-t-0',
      )}
      role="row"
    >
      <div className={cn(MATCH_DETAIL_COMPACT_PLAYER_CLASS, 'min-w-0')} role="cell">
        <div className={cn('match-detail-compact-player-avatar relative shrink-0 self-center')} title={characterName}>
          <CharacterAvatar
            characterNum={participant.characterNum}
            skinCode={participant.skinCode ?? undefined}
            characterName={participant.characterName ?? undefined}
            className="size-6"
          />
          <IconLevelBadge level={participant.characterLevel} size="sm" />
        </div>
        <p
          className={cn(
            'match-detail-compact-player-nickname text-foreground min-w-0 truncate text-[11px] leading-none font-semibold',
          )}
          title={nickname}
        >
          {nickname}
        </p>
        <p
          className={cn(
            'match-detail-compact-player-tier text-muted-foreground -mt-px min-w-0 truncate text-[9px] leading-none',
          )}
          title={tierRpLine}
        >
          {tierRpLine}
        </p>
        <div className="match-detail-compact-player-loadout self-center">
          <MatchLoadoutCompactGrid
            preview={equipmentPreview}
            size="mobile"
            cobaltLayout={cobaltLayout}
          />
        </div>
        {showInfusions && infusionCodes.length > 0 ? (
          <div className="match-detail-compact-player-infusion self-center">
            <ParticipantInfusions codes={infusionCodes} compact />
          </div>
        ) : null}
      </div>

      <div className={MATCH_DETAIL_COMPACT_METRICS_CLASS} role="cell" aria-label="전투 지표">
        <CompactMetricSlot
          slotIndex={1}
          label="TK"
          value={formatStat(participant.teamKills)}
          title="팀 킬"
        />
        <CompactMetricSlot
          slotIndex={2}
          label="K/D/A"
          value={kda}
          title="K/D/A"
        />
        <CompactMetricSlot
          slotIndex={3}
          label="피해"
          value={formatStat(participant.damageToPlayer)}
          title="플레이어 피해"
        />
        <CompactMetricSlot
          slotIndex={4}
          label="동물딜량"
          value={formatStat(participant.damageToMonster)}
          title="야생동물 피해"
        />
        <CompactMetricSlot
          slotIndex={5}
          label="시야"
          value={formatStat(participant.visionScore)}
          title="시야 점수"
        />
      </div>

      <div className={MATCH_DETAIL_COMPACT_GEAR_CLASS} role="cell">
        <MatchGearCrossGrid preview={equipmentPreview} size="mobile" />
      </div>
    </div>
  )
}
