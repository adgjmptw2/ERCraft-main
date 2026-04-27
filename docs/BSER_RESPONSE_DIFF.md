# BSER 응답 vs Mock 응답 비교

> mock 데이터(`src/mocks/matches.json`, `players.json`) 기준 vs BSER API 예상 응답 비교.
> BSER 응답 필드명은 공식 문서 확인 전까지 "예상" 또는 "확인 필요"로 표기.

---

## 유저 요약 (`PlayerSummaryContract`)

| Contract 필드 | mock 필드명 | BSER 예상 필드명 | 비고 |
|--------------|------------|-----------------|------|
| `userNum` | `userNum` | `userNum` | 일치 예상 |
| `nickname` | `nickname` | `nickname` | 일치 예상 |
| `level` | `level` | 확인 필요 | mock에는 있음 |
| `tier` | `tier` | 확인 필요 | mock은 `"Gold II"` 형태 문자열. BSER 형태 미확인 |
| `profileImageUrl` | `profileImageUrl?` | 확인 필요 | mock에는 없는 플레이어도 있음 |

**변환 로직 필요 여부:** `tier` 문자열 형태 일치 여부 확인 후 결정.

---

## 유저 통계 (`PlayerStatsContract`)

| Contract 필드 | mock 필드명 | BSER 예상 필드명 | 비고 |
|--------------|------------|-----------------|------|
| `userNum` | `userNum` | `userNum` | 일치 예상 |
| `seasonId` | `seasonId` | 확인 필요 | mock은 파일 상단 단일 값 |
| `games` | `games` | 확인 필요 | |
| `wins` | `wins` | 확인 필요 | |
| `losses` | `losses` | 확인 필요 | mock은 `games - wins`로 계산. BSER 직접 제공 여부 미확인 |
| `kills` | `kills` | 확인 필요 | |
| `deaths` | `deaths` | 확인 필요 | |
| `assists` | `assists` | 확인 필요 | |
| `top3` | `top3` | 확인 필요 | |
| `mmr` | `mmr` | 확인 필요 | BSER 필드명 다를 수 있음 |

**mock에만 있는 필드:** `winRate`, `avgKills`, `avgPlacement`, `aggregateKda` — loader에서 계산하는 값. Contract에 없음. DTO 변환에서 처리.

**변환 로직 필요 여부:** 거의 모든 필드 확인 후 결정. `losses`는 계산 필요할 수 있음.

---

## 매치 요약 (`MatchSummaryContract`)

| Contract 필드 | mock 필드명 | BSER 예상 필드명 | 비고 |
|--------------|------------|-----------------|------|
| `matchId` | `matchId` | 확인 필요 | mock은 `"m-1001"` 형태 |
| `userNum` | `userNum` | 확인 필요 | |
| `characterName` | `characterName` | 확인 필요 | mock은 영문 이름. BSER가 ID로 제공할 수도 있음 |
| `placement` | `placement` | 확인 필요 | |
| `kills` | `kills` | 확인 필요 | |
| `deaths` | `deaths` | 확인 필요 | |
| `assists` | `assists` | 확인 필요 | |
| `gameStartedAt` | `gameStartedAt` | 확인 필요 | mock은 ISO 8601. BSER 형태 미확인 |
| `victory` | `victory` | 확인 필요 | mock은 `placement <= 3` 기준 bool. BSER 직접 제공 여부 미확인 |

**주의:** `characterName`이 BSER에서 ID(숫자)로 오는 경우 별도 character 매핑 테이블 필요. 확인 전까지 보류.

**변환 로직 필요 여부:** `gameStartedAt` 날짜 형식, `victory` 계산, `characterName` 변환 가능성 — 모두 확인 후 결정.
