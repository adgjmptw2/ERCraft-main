# 11일차 — 돌아보기

---

**proxy 설계로 전환.** BSER API key를 프론트에 두면 빌드 결과물에 노출되기 때문에, 프론트는 `VITE_API_BASE_URL`만 쓰고 BSER 호출은 백엔드 proxy에서만 처리하기로 했다.

**contracts/ 분리.** 백엔드가 `src/types/`를 직접 import하면 나중에 분리가 힘들어져서, `backend/src/contracts/player.ts`에 프론트 타입과 같은 shape의 Contract 타입을 따로 정의해뒀다.

**skeleton 추가.** `backend/src/external/bserClient.ts`와 `bserMapper.ts`를 컴파일만 되는 구조로 만들어뒀다. 라우트에는 아직 안 붙였고, BSER API key 발급 전까지는 production 경로에서 호출되지 않는다.

**erClient.real.ts 주석 정정.** BSER 직접 호출이 아니라 백엔드 proxy endpoint 기준으로 주석을 다시 달았다.

**문서.** `BSER_API_MAPPING.md` — 메서드별 내부 API → BSER 경로, 미확정 항목. `BSER_RESPONSE_DIFF.md` — mock vs BSER 예상 필드 비교. `BSER_PROXY_DESIGN.md` — proxy 구조, 레이어 책임, 에러 흐름, 미확정 사항.
