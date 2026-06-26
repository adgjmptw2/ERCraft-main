import { useMemo, useState } from 'react'

import { characterPortraitUrlCandidates } from '@/utils/assetUrls'
import { cn } from '@/lib/utils'

export type CharacterAvatarSize = 'sm' | 'md' | 'lg'

const SIZE_CLASS: Record<CharacterAvatarSize, string> = {
  sm: 'size-6 text-[9px]',
  md: 'size-8 text-[10px]',
  lg: 'size-[54px] text-[13px]',
}

const SIZE_PX: Record<CharacterAvatarSize, number> = {
  sm: 24,
  md: 32,
  lg: 54,
}

export interface CharacterAvatarProps {
  characterNum?: number | null
  skinCode?: number | null
  characterName?: string
  size?: CharacterAvatarSize
  className?: string
  decorative?: boolean
}

function fallbackInitial(characterName?: string): string {
  return characterName?.trim().charAt(0).toUpperCase() || '?'
}

export function CharacterAvatar({
  characterNum,
  skinCode,
  characterName,
  size = 'md',
  className,
  decorative = true,
}: CharacterAvatarProps) {
  const candidates = useMemo(
    () => characterPortraitUrlCandidates(characterNum, skinCode),
    [characterNum, skinCode],
  )
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  const [portraitIdentity, setPortraitIdentity] = useState({ characterNum, skinCode })

  if (portraitIdentity.characterNum !== characterNum || portraitIdentity.skinCode !== skinCode) {
    setPortraitIdentity({ characterNum, skinCode })
    setCandidateIndex(0)
    setExhausted(false)
  }

  const portraitUrl = candidates[candidateIndex] ?? null
  const hasMoreCandidates = candidateIndex + 1 < candidates.length

  const sizeClass = SIZE_CLASS[size]
  const alt = decorative ? '' : `${characterName?.trim() || '캐릭터'} 초상화`

  const px = SIZE_PX[size]

  if (exhausted || !portraitUrl) {
    return (
      <div
        className={cn(
          'bg-primary/10 text-primary border-primary/20 flex shrink-0 items-center justify-center rounded-full border font-bold',
          sizeClass,
          className,
        )}
        style={{ width: px, height: px }}
        aria-hidden={decorative || undefined}
        title={characterName}
      >
        {fallbackInitial(characterName)}
      </div>
    )
  }

  return (
    <img
      src={portraitUrl}
      alt={alt}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      className={cn('shrink-0 rounded-full object-cover', sizeClass, className)}
      onError={() => {
        if (hasMoreCandidates) {
          setCandidateIndex((index) => index + 1)
          return
        }
        setExhausted(true)
      }}
    />
  )
}
