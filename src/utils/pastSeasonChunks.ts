/** 이전 시즌 lazy load — 현재 시즌 제외, 2~3시즌 단위 청크 (최근부터) */
export function buildPastSeasonChunks(currentSeason: number): Array<{ from: number; to: number }> {
  const maxPast = currentSeason - 1
  if (maxPast < 1) return []

  const chunks: Array<{ from: number; to: number }> = []
  let to = maxPast
  let first = true

  while (to >= 1) {
    const span = first ? 2 : 3
    first = false
    const from = Math.max(1, to - span + 1)
    chunks.push({ from, to })
    to = from - 1
  }

  return chunks
}
