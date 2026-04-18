// MOCK — swap with real API call once VITE_BSER_API_KEY is available

import type { PlayerStats, PlayerSummary } from '@/types/player'

export interface MockPlayerRow {
  summary: PlayerSummary
  stats: PlayerStats
}

export const MOCK_PLAYER_ROWS: MockPlayerRow[] = [
  {
    summary: {
      userNum: 482_901,
      nickname: 'ShadowCrescent',
      level: 87,
      tier: 'Diamond IV',
      profileImageUrl: undefined,
    },
    stats: {
      userNum: 482_901,
      seasonId: 12,
      games: 214,
      wins: 118,
      losses: 96,
      kills: 1840,
      deaths: 1202,
      assists: 910,
      top3: 156,
      mmr: 2840,
    },
  },
  {
    summary: {
      userNum: 901_332,
      nickname: 'LuminaBridge',
      level: 54,
      tier: 'Platinum II',
      profileImageUrl: undefined,
    },
    stats: {
      userNum: 901_332,
      seasonId: 12,
      games: 198,
      wins: 61,
      losses: 137,
      kills: 902,
      deaths: 1510,
      assists: 640,
      top3: 72,
      mmr: 2265,
    },
  },
  {
    summary: {
      userNum: 120_447,
      nickname: 'DriftKing_ER',
      level: 72,
      tier: 'Gold I',
      profileImageUrl: undefined,
    },
    stats: {
      userNum: 120_447,
      seasonId: 12,
      games: 176,
      wins: 88,
      losses: 88,
      kills: 1210,
      deaths: 1188,
      assists: 802,
      top3: 98,
      mmr: 2510,
    },
  },
]
