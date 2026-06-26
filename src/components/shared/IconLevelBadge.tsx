import { cn } from '@/lib/utils'

export interface IconLevelBadgeProps {
  level: number | null | undefined
  className?: string
  size?: 'sm' | 'md'
}

function isDisplayLevel(level: number | null | undefined): level is number {
  return level != null && Number.isFinite(level) && level > 0
}

export function IconLevelBadge({ level, className, size = 'md' }: IconLevelBadgeProps) {
  if (!isDisplayLevel(level)) return null

  const label = `레벨 ${level}`

  return (
    <span
      className={cn(
        'bg-background border-border text-foreground pointer-events-none absolute -right-0.5 -bottom-0.5 z-[1] flex items-center justify-center rounded-full border font-semibold leading-none tabular-nums',
        size === 'sm' ? 'size-[15px] min-w-[15px] text-[9px]' : 'size-[17px] min-w-[17px] text-[10px]',
        className,
      )}
      aria-label={label}
      title={label}
    >
      {level}
    </span>
  )
}
