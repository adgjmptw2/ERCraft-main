import type { EternalReturnClient } from '@/api/erClient'
import type { MatchSummary, Paginated } from '@/types/match'
import type { PlayerStats, PlayerSummary } from '@/types/player'
import { throwApiError } from '@/utils/apiError'

// 백엔드 proxy /api/players/* 를 호출하는 클라이언트.
// BSER API 직접 호출 안 함. BSER 호출은 backend/src/external/bserClient.ts에서만.

export class RealEternalReturnClient implements EternalReturnClient {
  // GET /api/players/search?nickname={nickname}
  async searchPlayers(_nickname: string): Promise<PlayerSummary[]> {
    void _nickname
    throwApiError('NOT_IMPLEMENTED', 'searchPlayers is not implemented yet')
  }

  // GET /api/players/{nickname}
  async fetchPlayerByNickname(_nickname: string): Promise<PlayerSummary | null> {
    void _nickname
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerByNickname is not implemented yet')
  }

  // GET /api/players/by-user/{userNum}
  // proxy endpoint 미확인. 설계 확정 후 구현.
  async fetchPlayerByUserNum(_userNum: number): Promise<PlayerSummary | null> {
    void _userNum
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerByUserNum is not implemented yet')
  }

  // GET /api/players/{userNum}/stats
  async fetchPlayerStats(_userNum: number): Promise<PlayerStats> {
    void _userNum
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerStats is not implemented yet')
  }

  // GET /api/players/{userNum}/matches?page={page}&pageSize={pageSize}
  async fetchMatchHistory(
    _userNum: number,
    _page: number,
    _pageSize: number,
  ): Promise<Paginated<MatchSummary>> {
    void _userNum
    void _page
    void _pageSize
    throwApiError('NOT_IMPLEMENTED', 'fetchMatchHistory is not implemented yet')
  }
}
