# 11일차 — 돌아보기

---

**proxy 설계로 전환.** BSER API key는 프론트에 두면 빌드 결과물에 노출되기 때문에, 프론트는 `VITE_API_BASE_URL`만 쓰고 BSER 호출은 백엔드 proxy에서만 처리하는 방향으로 정리했다.

**contracts/ 분리.** 백엔드가 `src/types/`를 직접 import하면 모노레포 간 의존성이 생겨 나중에 분리하기 어려워진다. `backend/src/contracts/player.ts`에 프론트 타입과 같은 shape를 유지하는 Contract 타입만 별도 정의했다.

**skeleton 추가.** `backend/src/external/bserClient.ts`와 `bserMapper.ts`를 컴파일 가능한 구조로만 만들었다. 아직 라우트에 연결하지 않았고, BSER API key 발급 전까지 production 경로에서 호출되지 않는다.

**erClient.real.ts 주석 정정.** BSER 직접 호출이 아니라 백엔드 proxy 엔드포인트 기준으로 주석 수정.

**문서.** `BSER_API_MAPPING.md` — 메서드별 내부 API → BSER 경로 + 미확정 항목. `BSER_RESPONSE_DIFF.md` — mock vs BSER 예상 필드 비교. `BSER_PROXY_DESIGN.md` — proxy 구조, 레이어 책임, 에러 흐름, 미확정 사항 정리.
