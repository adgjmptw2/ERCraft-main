/** React Query — 매치 상세 (gameId 기준, 플레이어와 분리) */
export const matchQueryKeys = {
  all: ['match-detail'] as const,
  detail: (gameId: string) => [...matchQueryKeys.all, gameId.trim()] as const,
}
