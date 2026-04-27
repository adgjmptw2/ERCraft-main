// TODO: BSER API key는 env.BSER_API_KEY에서만 읽을 것. 절대 프론트로 노출 금지.
// 이 클래스는 실제 BSER API key 발급 전까지 route에 연결하지 마.

export class BserClient {
  // TODO: GET /v1/user/nickname?nickname=
  // 응답에서 꺼낼 필드: 확인 필요
  // 예상 에러: 404(닉네임 없음), 429(rate limit)
  async searchByNickname(_nickname: string): Promise<unknown> {
    throw new Error('NOT_IMPLEMENTED: searchByNickname')
  }

  // TODO: GET /v2/user/stats/{userNum}/{seasonId}
  // seasonId 결정 방식 확인 필요 (config, env, 백엔드 기본값 중 미확정)
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

  // TODO: fetchPlayerByUserNum에 대응하는 BSER endpoint 미확인.
  // 공식 문서 확인 전까지 구현 금지.
  async getPlayerByUserNum(_userNum: number): Promise<unknown> {
    throw new Error('NOT_IMPLEMENTED: getPlayerByUserNum — endpoint 확인 필요')
  }
}
