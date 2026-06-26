import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { buildGearItemInfo } from '@/utils/gearItemInfo'
import type { EquipmentItemGrade } from '@/utils/equipmentItemGrade'

export interface GearItemInfoTriggerProps {
  slug?: string | null
  grade?: EquipmentItemGrade
  slotLabel: string
  className?: string
  children: ReactNode
}

export function GearItemInfoTrigger({
  slug,
  grade,
  slotLabel,
  className,
  children,
}: GearItemInfoTriggerProps) {
  const [open, setOpen] = useState(false)
  const info = buildGearItemInfo(slug, slotLabel, grade)

  if (!info) {
    return <div className={className}>{children}</div>
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className={cn('cursor-pointer text-left', className)}
        aria-expanded={open}
        aria-label={`${info.slotLabel} ${info.itemName} 정보`}
        onClick={() => setOpen((value) => !value)}
      >
        {children}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="아이템 정보 닫기"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="아이템 정보"
            className="bg-popover text-popover-foreground border-border absolute top-full right-0 z-50 mt-1 w-max max-w-[11rem] rounded-md border px-2 py-1.5 text-left shadow-md"
          >
            <p className="text-muted-foreground text-[10px] leading-none">{info.slotLabel}</p>
            <p className="text-foreground mt-0.5 text-xs leading-snug font-medium">{info.itemName}</p>
            {info.gradeLabel ? (
              <p className="text-muted-foreground mt-0.5 text-[10px] leading-none">
                등급: {info.gradeLabel}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
