// MOCK — swap with real API call once VITE_BSER_API_KEY is available

import type { RankingEntry } from '@/types/ranking'

export const MOCK_RANKING_ENTRIES: RankingEntry[] = [
  { rank: 1, userNum: 100_001, nickname: 'ER_Challenger01', tier: 'ER Challenger', mmr: 3200, games: 400, wins: 260 },
  { rank: 2, userNum: 100_002, nickname: 'HyperBloom', tier: 'ER Challenger', mmr: 3188, games: 512, wins: 301 },
  { rank: 3, userNum: 100_003, nickname: 'GlassLine', tier: 'Diamond I', mmr: 2990, games: 220, wins: 132 },
  { rank: 4, userNum: 482_901, nickname: 'ShadowCrescent', tier: 'Diamond IV', mmr: 2840, games: 214, wins: 118 },
  { rank: 5, userNum: 100_005, nickname: 'MuteSignal', tier: 'Diamond IV', mmr: 2822, games: 180, wins: 95 },
  { rank: 6, userNum: 100_006, nickname: 'VelvetRoute', tier: 'Platinum I', mmr: 2650, games: 300, wins: 150 },
  { rank: 7, userNum: 120_447, nickname: 'DriftKing_ER', tier: 'Gold I', mmr: 2510, games: 176, wins: 88 },
  { rank: 8, userNum: 100_008, nickname: 'EchoForge', tier: 'Platinum II', mmr: 2488, games: 140, wins: 70 },
  { rank: 9, userNum: 901_332, nickname: 'LuminaBridge', tier: 'Platinum II', mmr: 2265, games: 198, wins: 61 },
  { rank: 10, userNum: 100_010, nickname: 'NullSector', tier: 'Gold II', mmr: 2240, games: 95, wins: 48 },
  { rank: 11, userNum: 100_011, nickname: 'RavenCache', tier: 'Gold III', mmr: 2180, games: 120, wins: 55 },
  { rank: 12, userNum: 100_012, nickname: 'SoftCap', tier: 'Silver II', mmr: 2050, games: 60, wins: 28 },
  { rank: 13, userNum: 100_013, nickname: 'PatchLag', tier: 'Silver III', mmr: 1988, games: 88, wins: 36 },
  { rank: 14, userNum: 100_014, nickname: 'BlueZone', tier: 'Bronze I', mmr: 1820, games: 40, wins: 16 },
  { rank: 15, userNum: 100_015, nickname: 'LootGoblin', tier: 'Bronze II', mmr: 1755, games: 55, wins: 19 },
]
