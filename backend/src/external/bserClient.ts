export class BserClient {
  async searchByNickname(_nickname: string): Promise<unknown> {
    void _nickname
    throw new Error('NOT_IMPLEMENTED: searchByNickname')
  }

  async getStats(_userNum: number, _seasonId: number): Promise<unknown> {
    void _userNum
    void _seasonId
    throw new Error('NOT_IMPLEMENTED: getStats')
  }

  async getMatchHistory(_userNum: number, _next?: number): Promise<unknown> {
    void _userNum
    void _next
    throw new Error('NOT_IMPLEMENTED: getMatchHistory')
  }

  async getPlayerByUserNum(_userNum: number): Promise<unknown> {
    void _userNum
    throw new Error('NOT_IMPLEMENTED: getPlayerByUserNum endpoint is not confirmed')
  }
}
