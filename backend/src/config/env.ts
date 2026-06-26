// 의도:
// - test 환경에서 config import만으로 테스트가 실패하면 안 됨
// - BSER_API_KEY는 optional (키 발급 전에도 서버 실행 가능)
// - DATABASE_URL 강제 검증은 server.ts 실행 시점에서만

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '')
      : (process.env.DATABASE_URL ?? ''),
  testDatabaseUrl: process.env.TEST_DATABASE_URL ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  bserApiKey: process.env.BSER_API_KEY ?? '',
  // 0이면 BSER 게임 데이터(Season 테이블)에서 현재 시즌 자동 감지
  bserSeasonId: Number(process.env.BSER_SEASON_ID ?? 0),
  // fixed-v1: 고정 티어 기준선 + legacy role/combat, experimental-local: local DB live 기준선 검증
  characterGradeBenchmarkSource: process.env.CHARACTER_GRADE_BENCHMARK_SOURCE ?? '',
}
