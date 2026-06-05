import type { EternalReturnClient } from '@/api/erClient'
import type { MatchSummary, Paginated } from '@/types/match'
import type { PlayerStats, PlayerSummary } from '@/types/player'
import { throwApiError } from '@/utils/apiError'

// 백엔드 proxy 클라이언트 (BSER 직접 호출 금지)

export class RealEternalReturnClient implements EternalReturnClient {
  async searchPlayers(_nickname: string): Promise<PlayerSummary[]> {
    throwApiError('NOT_IMPLEMENTED', 'searchPlayers is not implemented yet')
  }

  async fetchPlayerByNickname(_nickname: string): Promise<PlayerSummary | null> {
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerByNickname is not implemented yet')
  }

  // proxy 엔드포인트 미확정
  async fetchPlayerByUserNum(_userNum: number): Promise<PlayerSummary | null> {
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerByUserNum is not implemented yet')
  }

  async fetchPlayerStats(_userNum: number): Promise<PlayerStats> {
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerStats is not implemented yet')
  }

  async fetchMatchHistory(
    _userNum: number,
    _page: number,
    _pageSize: number,
  ): Promise<Paginated<MatchSummary>> {
    throwApiError('NOT_IMPLEMENTED', 'fetchMatchHistory is not implemented yet')
  }
}
