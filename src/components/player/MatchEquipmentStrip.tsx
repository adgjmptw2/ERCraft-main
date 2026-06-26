import { resolveVerifiedGearItemSlug } from '@/assets/itemAssetMap'
import { extractTacticalSkillLevelFromGroupCode } from '@/assets/loadoutAssetMap'
import { GearItemInfoTrigger } from '@/components/player/GearItemInfoTrigger'
import { IconLevelBadge } from '@/components/shared/IconLevelBadge'
import {
  GEAR_ITEM_INNER_IMG_CLASS,
  GEAR_ITEM_INNER_WRAPPER_CLASS,
  LOADOUT_ASSET_ICON_IMG_CLASS,
} from '@/components/shared/GameAssetIcon'
import {
  TacticalSkillIcon,
  TraitIcon,
  WeaponTypeIcon,
  type GameAssetIconSize,
} from '@/components/shared'
import { cn } from '@/lib/utils'
import type { MatchEquipmentPreview } from '@/types/match'
import {
  equipmentGradeBgClass,
  type EquipmentItemGrade,
} from '@/utils/equipmentItemGrade'

interface MatchEquipmentStripProps {
  preview?: MatchEquipmentPreview
}

export const MATCH_LOADOUT_COMPACT_GRID_CLASS = 'match-loadout-compact-grid'

/** 슬롯 1~4 — 좌: 무기종류·스킬(사각) / 우: 메인·보조 특성(원형) */
export function MatchLoadoutSlotGrid({
  preview,
  iconSize = 'md',
  tacticalSkillGroup,
  cobaltLayout = false,
}: MatchEquipmentStripProps & {
  iconSize?: GameAssetIconSize
  tacticalSkillGroup?: number | null
  /** 코발트 — 보조 특성 슬롯 없음, 메인 특성 우측 가운데 */
  cobaltLayout?: boolean
}) {
  const loadoutImgClass = LOADOUT_ASSET_ICON_IMG_CLASS
  const tacticalLevel = extractTacticalSkillLevelFromGroupCode(tacticalSkillGroup)

  if (cobaltLayout) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-0.5" aria-label="무기·스킬·특성">
        <WeaponTypeIcon
          slug={preview?.weaponTypeSlug}
          size={iconSize}
          shape="square"
          decorative={false}
          label="무기 종류"
          className={loadoutImgClass}
        />
        <div className="row-span-2 flex items-center justify-center">
          <TraitIcon
            slug={preview?.mainTraitSlug}
            size={iconSize}
            decorative={false}
            label="메인 특성"
            className={loadoutImgClass}
          />
        </div>
        <div className="relative shrink-0">
          <TacticalSkillIcon
            slug={preview?.tacticalSkillSlug}
            size={iconSize}
            shape="square"
            decorative={false}
            label="전술 스킬"
            className={loadoutImgClass}
          />
          <IconLevelBadge level={tacticalLevel} size="sm" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-0.5" aria-label="무기·스킬·특성">
      <WeaponTypeIcon
        slug={preview?.weaponTypeSlug}
        size={iconSize}
        shape="square"
        decorative={false}
        label="무기 종류"
        className={loadoutImgClass}
      />
      <TraitIcon
        slug={preview?.mainTraitSlug}
        size={iconSize}
        decorative={false}
        label="메인 특성"
        className={loadoutImgClass}
      />
      <div className="relative shrink-0">
        <TacticalSkillIcon
          slug={preview?.tacticalSkillSlug}
          size={iconSize}
          shape="square"
          decorative={false}
          label="전술 스킬"
          className={loadoutImgClass}
        />
        <IconLevelBadge level={tacticalLevel} size="sm" />
      </div>
      <TraitIcon
        slug={preview?.subTraitSlug}
        size={iconSize}
        decorative={false}
        label="보조 특성"
        className={loadoutImgClass}
      />
    </div>
  )
}

const GEAR_SLOT_CLASS =
  'text-muted-foreground relative block h-[26px] w-[38px] rounded-[3px] text-[8px] font-medium'

function MatchGearSlot({
  slug,
  grade,
  label,
}: {
  slug?: string | null
  grade?: EquipmentItemGrade
  label: string
}) {
  const verified = resolveVerifiedGearItemSlug(slug)
  const iconUrl = verified ? `/assets/items/${verified}.webp` : null

  return (
    <GearItemInfoTrigger
      slug={slug}
      grade={grade}
      slotLabel={label}
      className={cn(
        GEAR_SLOT_CLASS,
        equipmentGradeBgClass(grade) ?? 'border-border/50 bg-muted/60 border',
      )}
    >
      {iconUrl ? (
        <div className={GEAR_ITEM_INNER_WRAPPER_CLASS}>
          <img src={iconUrl} alt="" className={GEAR_ITEM_INNER_IMG_CLASS} loading="lazy" />
        </div>
      ) : (
        <span className="flex h-full items-center justify-center">·</span>
      )}
    </GearItemInfoTrigger>
  )
}

/** 슬롯 5~9 — 무기 · 상의 · 모자 · 팔 · 신발 */
export function MatchGearSlotGrid({
  preview,
  className,
}: MatchEquipmentStripProps & { className?: string }) {
  const gear = preview?.gear

  const grades = preview?.gearGrade

  const slots = [
    { key: 'weapon', slug: gear?.weapon, grade: grades?.weapon, label: '무기' },
    { key: 'chest', slug: gear?.chest, grade: grades?.chest, label: '상의' },
    { key: 'head', slug: gear?.head, grade: grades?.head, label: '모자' },
    { key: 'arm', slug: gear?.arm, grade: grades?.arm, label: '팔' },
    { key: 'leg', slug: gear?.leg, grade: grades?.leg, label: '신발' },
  ] as const

  return (
    <div className={cn('space-y-0.5', className)} aria-label="장비">
      <div className="flex gap-0.5">
        {slots.slice(0, 3).map((slot) => (
          <MatchGearSlot
            key={slot.key}
            slug={slot.slug}
            grade={slot.grade}
            label={slot.label}
          />
        ))}
      </div>
      <div className="ml-5 flex gap-0.5">
        {slots.slice(3).map((slot) => (
          <MatchGearSlot
            key={slot.key}
            slug={slot.slug}
            grade={slot.grade}
            label={slot.label}
          />
        ))}
      </div>
    </div>
  )
}

export const MATCH_GEAR_CROSS_GRID_CLASS = 'match-gear-cross-grid'

const GEAR_CROSS_SLOT_PLACEMENT = [
  'col-span-2 col-start-1 row-start-1',
  'col-span-2 col-start-3 row-start-1',
  'col-span-2 col-start-5 row-start-1',
  'col-span-2 col-start-2 row-start-2',
  'col-span-2 col-start-4 row-start-2',
] as const

const GEAR_CROSS_SLOT_SIZE_CLASS = {
  desktop: 'h-6 w-[26px] text-[7px]',
  tablet: 'h-[23px] w-[24px] text-[7px]',
  mobile: 'h-[18px] w-[25px] text-[6px]',
} as const

type GearCrossSize = keyof typeof GEAR_CROSS_SLOT_SIZE_CLASS

function CrossGearSlot({
  slotKey,
  slug,
  grade,
  label,
  size,
}: {
  slotKey: string
  slug?: string | null
  grade?: EquipmentItemGrade
  label: string
  size: GearCrossSize
}) {
  const verified = resolveVerifiedGearItemSlug(slug)
  const iconUrl = verified ? `/assets/items/${verified}.webp` : null

  return (
    <div data-gear-slot={slotKey} className="flex justify-center">
      <GearItemInfoTrigger
        slug={slug}
        grade={grade}
        slotLabel={label}
        className={cn(
          'text-muted-foreground relative block shrink-0 rounded-[2px] font-medium',
          GEAR_CROSS_SLOT_SIZE_CLASS[size],
          equipmentGradeBgClass(grade) ?? 'border-border/40 bg-muted/40 border',
        )}
      >
        {iconUrl ? (
          <div className={GEAR_ITEM_INNER_WRAPPER_CLASS}>
            <img src={iconUrl} alt="" className={GEAR_ITEM_INNER_IMG_CLASS} loading="lazy" />
          </div>
        ) : (
          <span className="flex h-full items-center justify-center opacity-40">·</span>
        )}
      </GearItemInfoTrigger>
    </div>
  )
}

function buildGearSlots(preview?: MatchEquipmentPreview) {
  const gear = preview?.gear
  const grades = preview?.gearGrade

  return [
    { key: 'weapon', slug: gear?.weapon, grade: grades?.weapon, label: '무기' },
    { key: 'chest', slug: gear?.chest, grade: grades?.chest, label: '상의' },
    { key: 'head', slug: gear?.head, grade: grades?.head, label: '모자' },
    { key: 'arm', slug: gear?.arm, grade: grades?.arm, label: '팔' },
    { key: 'leg', slug: gear?.leg, grade: grades?.leg, label: '신발' },
  ] as const
}

/** compact match detail — 장비 5칸 3+2 교차형 */
export function MatchGearCrossGrid({
  preview,
  className,
  size = 'desktop',
}: MatchEquipmentStripProps & { className?: string; size?: GearCrossSize }) {
  const slots = buildGearSlots(preview)
  const gridWidthClass =
    size === 'mobile' ? 'w-[78px]' : size === 'tablet' ? 'w-[76px]' : 'w-[82px]'
  const rowHeightClass =
    size === 'mobile' ? '[grid-template-rows:repeat(2,18px)]' : '[grid-template-rows:repeat(2,24px)]'

  return (
    <div
      className={cn(
        MATCH_GEAR_CROSS_GRID_CLASS,
        'grid shrink-0 grid-cols-6 gap-px',
        gridWidthClass,
        rowHeightClass,
        className,
      )}
      aria-label="장비"
    >
      {slots.map((slot, index) => (
        <div key={slot.key} className={cn('flex items-center justify-center', GEAR_CROSS_SLOT_PLACEMENT[index])}>
          <CrossGearSlot
            slotKey={slot.key}
            slug={slot.slug}
            grade={slot.grade}
            label={slot.label}
            size={size}
          />
        </div>
      ))}
    </div>
  )
}

/** compact match detail — 무기·스킬·특성 2×2 */
export function MatchLoadoutCompactGrid({
  preview,
  iconClassName,
  size = 'desktop',
  cobaltLayout = false,
}: MatchEquipmentStripProps & {
  iconClassName?: string
  size?: 'desktop' | 'mobile'
  cobaltLayout?: boolean
}) {
  const loadoutImgClass = cn(
    LOADOUT_ASSET_ICON_IMG_CLASS,
    iconClassName ?? (size === 'mobile' ? '!size-[18px]' : '!size-4'),
  )
  const gridWidthClass = 'w-[40px]'

  if (cobaltLayout) {
    return (
      <div
        className={cn(MATCH_LOADOUT_COMPACT_GRID_CLASS, 'grid shrink-0 grid-cols-2 grid-rows-2 gap-px', gridWidthClass)}
        aria-label="무기·스킬·특성"
      >
        <WeaponTypeIcon
          slug={preview?.weaponTypeSlug}
          size="sm"
          shape="square"
          decorative={false}
          label="무기 종류"
          className={loadoutImgClass}
        />
        <div className="row-span-2 flex items-center justify-center">
          <TraitIcon
            slug={preview?.mainTraitSlug}
            size="sm"
            decorative={false}
            label="메인 특성"
            className={loadoutImgClass}
          />
        </div>
        <TacticalSkillIcon
          slug={preview?.tacticalSkillSlug}
          size="sm"
          shape="square"
          decorative={false}
          label="전술 스킬"
          className={loadoutImgClass}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(MATCH_LOADOUT_COMPACT_GRID_CLASS, 'grid shrink-0 grid-cols-2 gap-px', gridWidthClass)}
      aria-label="무기·스킬·특성"
    >
      <WeaponTypeIcon
        slug={preview?.weaponTypeSlug}
        size="sm"
        shape="square"
        decorative={false}
        label="무기 종류"
        className={loadoutImgClass}
      />
      <TraitIcon
        slug={preview?.mainTraitSlug}
        size="sm"
        decorative={false}
        label="메인 특성"
        className={loadoutImgClass}
      />
      <TacticalSkillIcon
        slug={preview?.tacticalSkillSlug}
        size="sm"
        shape="square"
        decorative={false}
        label="전술 스킬"
        className={loadoutImgClass}
      />
      <TraitIcon
        slug={preview?.subTraitSlug}
        size="sm"
        decorative={false}
        label="보조 특성"
        className={loadoutImgClass}
      />
    </div>
  )
}

export function MatchLoadoutCompactStrip({
  preview,
  iconClassName,
  cobaltLayout = false,
}: MatchEquipmentStripProps & {
  iconClassName?: string
  cobaltLayout?: boolean
}) {
  const loadoutImgClass = cn(LOADOUT_ASSET_ICON_IMG_CLASS, iconClassName ?? '!size-4')

  if (cobaltLayout) {
    return (
      <div className="flex shrink-0 items-center gap-0.5" aria-label="무기·스킬·특성">
        <WeaponTypeIcon
          slug={preview?.weaponTypeSlug}
          size="sm"
          shape="square"
          decorative={false}
          label="무기 종류"
          className={loadoutImgClass}
        />
        <TacticalSkillIcon
          slug={preview?.tacticalSkillSlug}
          size="sm"
          shape="square"
          decorative={false}
          label="전술 스킬"
          className={loadoutImgClass}
        />
        <TraitIcon
          slug={preview?.mainTraitSlug}
          size="sm"
          decorative={false}
          label="메인 특성"
          className={loadoutImgClass}
        />
      </div>
    )
  }

  return (
    <div className="flex shrink-0 gap-0.5" aria-label="무기·스킬·특성">
      <WeaponTypeIcon
        slug={preview?.weaponTypeSlug}
        size="sm"
        shape="square"
        decorative={false}
        label="무기 종류"
        className={loadoutImgClass}
      />
      <TraitIcon
        slug={preview?.mainTraitSlug}
        size="sm"
        decorative={false}
        label="메인 특성"
        className={loadoutImgClass}
      />
      <TacticalSkillIcon
        slug={preview?.tacticalSkillSlug}
        size="sm"
        shape="square"
        decorative={false}
        label="전술 스킬"
        className={loadoutImgClass}
      />
      <TraitIcon
        slug={preview?.subTraitSlug}
        size="sm"
        decorative={false}
        label="보조 특성"
        className={loadoutImgClass}
      />
    </div>
  )
}
