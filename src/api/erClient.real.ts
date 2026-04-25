import type { EternalReturnClient } from '@/api/erClient'
import type { MatchSummary, Paginated } from '@/types/match'
import type { PlayerStats, PlayerSummary } from '@/types/player'
import { throwApiError } from '@/utils/apiError'

export class RealEternalReturnClient implements EternalReturnClient {
  async searchPlayers(_nickname: string): Promise<PlayerSummary[]> {
    void _nickname
    throwApiError('NOT_IMPLEMENTED', 'searchPlayers is not implemented yet')
  }

  async fetchPlayerByNickname(_nickname: string): Promise<PlayerSummary | null> {
    void _nickname
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerByNickname is not implemented yet')
  }

  async fetchPlayerByUserNum(_userNum: number): Promise<PlayerSummary | null> {
    void _userNum
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerByUserNum is not implemented yet')
  }

  async fetchPlayerStats(_userNum: number): Promise<PlayerStats> {
    void _userNum
    throwApiError('NOT_IMPLEMENTED', 'fetchPlayerStats is not implemented yet')
  }

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
