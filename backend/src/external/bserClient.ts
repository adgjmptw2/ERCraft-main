// BSER_API_KEY는 env에서만. 프론트에 절대 내려가면 안 됨.
// key 발급 전까지 route에 안 붙임.

export class BserClient {
  // TODO: GET /v1/user/nickname?nickname=
  // 응답에서 꺼낼 필드 확인 필요
  // 예상 에러: 404(닉네임 없음), 429(rate limit)
  async searchByNickname(_nickname: string): Promise<unknown> {
    throw new Error('NOT_IMPLEMENTED: searchByNickname')
  }

  // TODO: GET /v2/user/stats/{userNum}/{seasonId}
  // seasonId 결정 방식 미확정 (config, env, 백엔드 기본값 중 하나)
  // 예상 에러: 404(유저 없음), 429(rate limit)
  async getStats(_userNum: number, _seasonId: number): Promise<unknown> {
    throw new Error('NOT_IMPLEMENTED: getStats')
  }

  // TODO: GET /v1/user/games/{userNum}
  // 페이지네이션 방식 확인 필요 (page 기반 vs cursor 기반)
  // 예상 에러: 404(유저 없음), 429(rate limit)
  async getMatchHistory(_userNum: number, _next?: number): Promise<unknown> {
    throw new Error('NOT_IMPLEMENTED: getMatchHistory')
  }

  // TODO: fetchPlayerByUserNum에 대응하는 BSER endpoint 미확인
  // 공식 문서 보기 전까지 미구현 상태 유지
  async getPlayerByUserNum(_userNum: number): Promise<unknown> {
    throw new Error('NOT_IMPLEMENTED: getPlayerByUserNum — endpoint 확인 필요')
  }
}
