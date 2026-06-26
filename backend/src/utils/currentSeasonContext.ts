import type { SeasonCatalog } from '../external/seasonCatalog.js'

/** UI 표시 시즌 번호(S11)와 BSER API season ID(39)를 한 곳에서 해석 */
export interface CurrentSeasonContext {
  displaySeasonNumber: number
  apiSeasonId: number
}

export function currentSeasonContextFromCatalog(
  catalog: SeasonCatalog,
): CurrentSeasonContext | null {
  const apiSeasonId = catalog.currentApiSeasonIdOrNull()
  if (apiSeasonId === null) return null
  const displaySeasonNumber = catalog.displayForApiId(apiSeasonId) ?? apiSeasonId
  return { displaySeasonNumber, apiSeasonId }
}
