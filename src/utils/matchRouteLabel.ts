import type { GameMode } from '@/utils/gameMode'

export interface MatchRouteLabelInput {
  gameMode: GameMode
  routeIdOfStart?: number
  routeSlotId?: number
  /** API 필드 없을 때 mock용 5자리 루트 ID */
  demoRouteId?: number
}

/** 코발트·미공개(slotId < 0)는 `루트 -`, 공개 루트는 routeIdOfStart를 표시 */
export function formatMatchRouteLabel({
  gameMode,
  routeIdOfStart,
  routeSlotId,
  demoRouteId,
}: MatchRouteLabelInput): string {
  if (gameMode === 'cobalt') return '루트 -'

  if (routeIdOfStart !== undefined && routeIdOfStart > 0) {
    if (routeSlotId !== undefined && routeSlotId < 0) return '루트 -'
    return `루트 #${routeIdOfStart}`
  }

  if (demoRouteId !== undefined && demoRouteId > 0) {
    return `루트 #${demoRouteId}`
  }

  return '루트 -'
}
