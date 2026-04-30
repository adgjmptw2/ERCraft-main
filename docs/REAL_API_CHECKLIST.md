# BSER API 연동 시 변경할 곳

## 프론트

- [ ] `src/api/erClient.real.ts` — BSER 직접 호출이 아니라 백엔드 `/api/players/*` proxy 호출로 구현
- [ ] `src/api/erClient.real.ts` — 응답을 `EternalReturnClient` 인터페이스 shape로 맞추기

## 백엔드 필수

- [ ] `backend/src/external/bserClient.ts` 구현
- [ ] `backend/src/external/bserMapper.ts` 구현
- [ ] `backend/.env`에 `BSER_API_KEY` 입력 (프론트 env에 넣지 말 것)
- [ ] `BSER_API_MAPPING.md`의 "확인 필요" 항목 채우기
- [ ] seasonId 결정 방식 정하기 (현재 시즌 API / env / 설정값)

## 보안

- [ ] `BSER_API_KEY`가 응답/로그에 노출되지 않는지 확인
- [ ] BSER API 호출이 백엔드에서만 일어나는지 확인
- [ ] `CORS_ORIGIN`이 실제 프론트 URL로 설정됐는지 확인

## 응답 형태 검증

- [ ] `PlayerSummary` 필드명 실제 응답과 비교
- [ ] `PlayerStats` seasonId 처리 방식 확인
- [ ] `MatchSummary` matchId 형태 확인 (string vs number)
- [ ] 페이지네이션 방식 확인 (page 기반 vs cursor 기반)

## 외부 API 장애 대응

- [ ] BSER 429 rate limit → 백엔드에서 적절한 에러 반환
- [ ] BSER 502/503 → 프론트에 의미있는 에러 메시지
- [ ] 타임아웃 설정 확인

## 캐싱 (선택)

- [ ] `cached_player_stats` 테이블 연동
- [ ] `cached_match_history` 테이블 연동
- [ ] `source: 'cache'` vs `'external'` 분기 동작 확인
