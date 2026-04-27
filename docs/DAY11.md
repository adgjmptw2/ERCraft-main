# 11일차 — 돌아보기

---

**proxy.** BSER API key는 프론트에 두면 빌드에 그대로 박혀서, 프론트는 `VITE_API_BASE_URL`만 쓰고 BSER 호출은 백엔드 proxy로만 가게 정리.

**contracts.** 백엔드가 `src/types`를 직접 import하면 나중에 떼기 귀찮아져서, `backend/src/contracts/player.ts`에 Contract만 따로 둠. shape는 프론트랑 맞춰 둠.

**skeleton.** `bserClient.ts`, `bserMapper.ts`는 컴파일만 되는 골격. 라우트엔 아직 안 붙였고, 키 나오기 전엔 production 경로에서 안 탐.

**erClient.real.** BSER 직접 치는 것처럼 보이던 주석을 proxy 기준으로 고침.

**문서.** `BSER_API_MAPPING.md`, `BSER_RESPONSE_DIFF.md`, `BSER_PROXY_DESIGN.md`.
