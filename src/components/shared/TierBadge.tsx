import { useState } from 'react'

import { tierAccentColor } from '@/utils/rankTier'
import { tierBadgeUrl } from '@/utils/assetUrls'
import { cn } from '@/lib/utils'

export interface TierBadgeProps {
  tier: string
  className?: string
  /** false면 텍스트 배지만 (이미지 요청 없음) */
  showTierImage?: boolean
}

export function TierBadge({ tier, className, showTierImage = true }: TierBadgeProps) {
  const label = tier.trim() || '—'
  const accent = tierAccentColor(label)
  const imageUrl = showTierImage ? tierBadgeUrl(label) : null
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = imageUrl !== null && failedUrl !== imageUrl

  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{
        color: accent,
        borderColor: `${accent}55`,
        backgroundColor: `${accent}18`,
      }}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          decoding="async"
          className="size-[18px] shrink-0 object-contain"
          onError={() => {
            if (imageUrl) setFailedUrl(imageUrl)
          }}
        />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  )
}
