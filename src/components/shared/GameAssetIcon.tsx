import { useState } from 'react'

import { cn } from '@/lib/utils'
import {
  equipmentGradeBgClass,
  type EquipmentItemGrade,
} from '@/utils/equipmentItemGrade'

export type GameAssetIconSize = 'sm' | 'md' | 'gear' | 'lg'

const SIZE_DIM: Record<GameAssetIconSize, { w: number; h: number }> = {
  sm: { w: 24, h: 24 },
  md: { w: 27, h: 27 },
  gear: { w: 36, h: 30 },
  lg: { w: 32, h: 32 },
}

export type GameAssetIconShape = 'square' | 'circle'

export interface GameAssetIconProps {
  src?: string | null
  label?: string
  size?: GameAssetIconSize
  shape?: GameAssetIconShape
  className?: string
  fallbackText?: string
  decorative?: boolean
  /** 전설·영웅·혈액 등급 배경 */
  grade?: EquipmentItemGrade
}

function fallbackGlyph(label?: string, fallbackText?: string): string {
  if (fallbackText?.trim()) return fallbackText.trim().slice(0, 2)
  return label?.trim().charAt(0).toUpperCase() || ''
}

const shapeClass: Record<GameAssetIconShape, string> = {
  square: 'rounded-[3px]',
  circle: 'rounded-full',
}

/** 슬롯 크기는 유지하고 이미지 콘텐츠만 축소·중앙 정렬 */
export const GAME_ASSET_ICON_IMG_CLASS =
  'block scale-[0.97] object-contain object-center'

/** 무기·스킬·특성 로드아웃 슬롯 — 칸에 맞게 살짝 확대 */
export const LOADOUT_ASSET_ICON_IMG_CLASS =
  'block scale-[1.06] object-contain object-center'

/** wrapper 안에 넣는 장비 아이콘 img */
export const GAME_ASSET_ICON_NESTED_IMG_CLASS =
  'block max-h-[98%] max-w-[98%] object-contain object-center'

/** 장비 슬롯(고정 크기) 안에서 아이템 아이콘만 확대 — 슬롯 박스 크기는 그대로 */
export const GEAR_ITEM_INNER_WRAPPER_CLASS =
  'absolute inset-0 flex items-center justify-center overflow-hidden'

export const GEAR_ITEM_INNER_IMG_CLASS =
  'block h-full w-full scale-[1.55] object-contain object-center'

export function GameAssetIcon({
  src,
  label,
  size = 'sm',
  shape = 'square',
  className,
  fallbackText,
  decorative = true,
  grade,
}: GameAssetIconProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const { w: widthPx, h: heightPx } = SIZE_DIM[size]
  const showImage = src != null && src.length > 0 && failedUrl !== src
  const alt = decorative ? '' : `${label?.trim() || '아이콘'} 아이콘`
  const glyph = fallbackGlyph(label, fallbackText)
  const gradeBg = equipmentGradeBgClass(grade)

  if (!showImage) {
    return (
      <div
        className={cn(
          'text-muted-foreground flex shrink-0 items-center justify-center text-[9px] font-medium',
          gradeBg ?? 'border-border/70 bg-muted/30 border',
          shapeClass[shape],
          !glyph && 'opacity-40',
          className,
        )}
        style={{ width: widthPx, height: heightPx }}
        aria-hidden={decorative || undefined}
        title={label}
      >
        {glyph || null}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      width={widthPx}
      height={heightPx}
      loading="lazy"
      decoding="async"
      className={cn(
        'shrink-0',
        gradeBg ?? 'border-border/70 border',
        GAME_ASSET_ICON_IMG_CLASS,
        shapeClass[shape],
        className,
      )}
      style={{ width: widthPx, height: heightPx }}
      title={label}
      onError={() => {
        if (src) setFailedUrl(src)
      }}
    />
  )
}
