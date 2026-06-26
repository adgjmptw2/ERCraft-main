# ERCraft Character Grade Rules

Generated: 2026-06-20T06:20:05.194Z

## Score structure

- Final score = outcome 45% + role 55.00000000000001%
- Sample confidence correction applies after raw score.
- Fewer than 5 valid games → grade not shown.
- DAK.GG static tier baseline for outcome and legacy role metrics.
- Official BSER match fields stored in PlayerMatch; ERCraft aggregates exact-combination baselines.
- Fallback keeps grade visible when live eligibility fails.
- supportSubtype: healer (`41:24`, `73:24`) vs utility (all other supports).
- combatContributionRatio: (playerKill + playerAssistant * 0.7) / teamKill — 가중 교전 기여 비율이며 공식 킬 관여율 지표가 아니다.
- Live priority: H role modes (tank-t2/t1, support-healer-s1) → J combat C3 → legacy K/A/TK.

## Explainability (39.11K — dev only)

- combatContributionRatio is a weighted combat contribution ratio, not official kill participation.
- Individual match fields (kills, assists, teamKills, etc.) come from official BSER PlayerMatch rows.
- combatContribution and finisherShare baselines are ERCraft S11 DB aggregations (not DAK.GG).
- DAK.GG tier baselines use periodDays=7 static snapshot; combat baselines use S11 participant rows with separate playedAt span.
- weightedContribution = normalizedScore × weight / 100 (points inside the 100-point role or outcome section).
- Dev grade breakdown: `node scripts/explain-character-grade.mjs --nickname=<nick> --character-num=<n> --weapon-type-id=<w>`
- Rollout audit: `node scripts/audit-grade-rollout.mjs` → `backend/tmp/grade-rollout-audit/`
- Combat preset requires every configured metric to pass coverage gates; missing metrics do not redistribute weight.
- Incomplete combat presets fall back to the full legacy role preset.
- Blocklist safety: mean |Δ|>5, max |Δ|>10, coarse change >10%, two-plus-step >5%, small-sample review-needed.
- viewContribution and monsterKill require structured coverage ≥80% with ≥5 valid games.

## Counts

- canonical character+weapon combinations: 113
- support canonical combinations: 6
- utility support canonical: 4
- healer support canonical: 2
- combat live eligible exact baseline keys (provisional+): 59
- combat live blocklist exact keys: 9
- combat live applied exact keys (last rollout audit): 6

## Role legacy weights (sum 100 each)

- 평타 딜러: damageToPlayer 27, playerKill 17, teamKill 15, playerAssistant 8, survival 10, viewContribution 9, monsterKill 14 (sum 100, K+A+TK share 40%)
- 스증 딜러: damageToPlayer 30, playerKill 16, teamKill 16, playerAssistant 10, survival 10, viewContribution 9, monsterKill 9 (sum 100, K+A+TK share 42%)
- 암살자: damageToPlayer 21, playerKill 23, teamKill 18, playerAssistant 7, survival 13, viewContribution 8, monsterKill 10 (sum 100, K+A+TK share 48%)
- 평타 브루저: damageToPlayer 20, playerKill 12, teamKill 18, playerAssistant 10, survival 18, viewContribution 10, monsterKill 12 (sum 100, K+A+TK share 40%)
- 스증 브루저: damageToPlayer 22, playerKill 10, teamKill 19, playerAssistant 12, survival 18, viewContribution 10, monsterKill 9 (sum 100, K+A+TK share 41%)
- 탱커: damageToPlayer 8, playerKill 4, teamKill 21, playerAssistant 19, survival 26, viewContribution 15, monsterKill 7 (sum 100, K+A+TK share 44%)
- 서포터: damageToPlayer 5, playerKill 3, teamKill 22, playerAssistant 28, survival 19, viewContribution 20, monsterKill 3 (sum 100, K+A+TK share 53%)

## Combat live C3 presets (39.11J — limited rollout)

- 평타 브루저: damageToPlayer 29, combatContribution 20, survival 25, viewContribution 10, monsterKill 16
- 암살자: damageToPlayer 31, combatContribution 18, finisherShare 8, survival 20, viewContribution 10, monsterKill 13
- 스증 브루저: damageToPlayer 31, combatContribution 20, survival 25, viewContribution 12, monsterKill 12
- 스증 딜러: damageToPlayer 43, combatContribution 18, finisherShare 3, survival 15, viewContribution 10, monsterKill 11
- 탱커: damageToPlayer 7, combatContribution 20, survival 38, viewContribution 25, monsterKill 10
- 평타 딜러: damageToPlayer 41, combatContribution 18, finisherShare 3, survival 15, viewContribution 8, monsterKill 15
- 서포터: damageToPlayer 5, combatContribution 20, survival 30, viewContribution 35, monsterKill 10

## 113 combinations

| characterNum | name | weapon | key | role | finisher | combat readiness | combat live | combat mode | legacy K+A+TK % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 재키 | 도끼 (14) | 1:14 | 평타 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 40% |
| 1 | 재키 | 단검 (15) | 1:15 | 암살자 | yes | unavailable | no-exact-baseline | assassin-combat-c3 | 48% |
| 1 | 재키 | 양손검 (16) | 1:16 | 평타 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 40% |
| 1 | 재키 | 쌍검 (18) | 1:18 | 평타 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 40% |
| 10 | 리 다이린 | 글러브 (1) | 10:1 | 평타 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 40% |
| 10 | 리 다이린 | 쌍절곤 (20) | 10:20 | 스증 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 41% |
| 11 | 유키 | 양손검 (16) | 11:16 | 평타 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 40% |
| 11 | 유키 | 쌍검 (18) | 11:18 | 평타 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 40% |
| 12 | 혜진 | 암기 (6) | 12:6 | 스증 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 42% |
| 12 | 혜진 | 활 (7) | 12:7 | 스증 딜러 | yes | unusable | readiness-insufficient | dealer-combat-c3 | 42% |
| 13 | 쇼우 | 단검 (15) | 13:15 | 탱커 | no | unavailable | no-exact-baseline | tank-combat-fallback | 44% |
| 13 | 쇼우 | 창 (19) | 13:19 | 탱커 | no | experimental | readiness-insufficient | tank-combat-fallback | 44% |
| 14 | 키아라 | 레이피어 (21) | 14:21 | 스증 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 41% |
| 15 | 시셀라 | 투척 (5) | 15:5 | 스증 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 42% |
| 15 | 시셀라 | 암기 (6) | 15:6 | 스증 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 42% |
| 16 | 실비아 | 권총 (9) | 16:9 | 스증 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 41% |
| 17 | 아드리아나 | 투척 (5) | 17:5 | 스증 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 42% |
| 18 | 쇼이치 | 단검 (15) | 18:15 | 암살자 | yes | unavailable | no-exact-baseline | assassin-combat-c3 | 48% |
| 19 | 엠마 | 아르카나 (24) | 19:24 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 19 | 엠마 | 암기 (6) | 19:6 | 스증 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 42% |
| 2 | 아야 | 돌격 소총 (10) | 2:10 | 평타 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 40% |
| 2 | 아야 | 저격총 (11) | 2:11 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 2 | 아야 | 권총 (9) | 2:9 | 스증 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 42% |
| 20 | 레녹스 | 채찍 (4) | 20:4 | 탱커 | no | unusable | readiness-insufficient | tank-combat-fallback | 44% |
| 21 | 로지 | 권총 (9) | 21:9 | 평타 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 40% |
| 22 | 루크 | 방망이 (3) | 22:3 | 평타 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 40% |
| 23 | 캐시 | 단검 (15) | 23:15 | 암살자 | yes | unavailable | no-exact-baseline | assassin-combat-c3 | 48% |
| 23 | 캐시 | 쌍검 (18) | 23:18 | 암살자 | yes | unavailable | no-exact-baseline | assassin-combat-c3 | 48% |
| 24 | 아델라 | 레이피어 (21) | 24:21 | 스증 딜러 | yes | unavailable | no-exact-baseline | dealer-combat-c3 | 42% |
| 24 | 아델라 | 방망이 (3) | 24:3 | 스증 딜러 | yes | unavailable | no-exact-baseline | dealer-combat-c3 | 42% |
| 25 | 버니스 | 저격총 (11) | 25:11 | 평타 딜러 | yes | unusable | readiness-insufficient | dealer-combat-c3 | 40% |
| 26 | 바바라 | 권총 (9) | 26:9 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 27 | 알렉스 | 통파 (2) | 27:2 | 탱커 | no | unavailable | no-exact-baseline | tank-combat-fallback | 44% |
| 28 | 수아 | 망치 (13) | 28:13 | 탱커 | no | unavailable | no-exact-baseline | tank-combat-fallback | 44% |
| 28 | 수아 | 방망이 (3) | 28:3 | 스증 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 41% |
| 29 | 레온 | 글러브 (1) | 29:1 | 스증 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 41% |
| 29 | 레온 | 통파 (2) | 29:2 | 탱커 | no | unavailable | no-exact-baseline | tank-combat-fallback | 44% |
| 3 | 피오라 | 양손검 (16) | 3:16 | 평타 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 40% |
| 3 | 피오라 | 창 (19) | 3:19 | 스증 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 41% |
| 3 | 피오라 | 레이피어 (21) | 3:21 | 평타 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 40% |
| 30 | 일레븐 | 망치 (13) | 30:13 | 탱커 | no | ready | provisional-or-ready | tank-combat-fallback | 44% |
| 31 | 리오 | 활 (7) | 31:7 | 평타 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 40% |
| 32 | 윌리엄 | 투척 (5) | 32:5 | 평타 딜러 | yes | unusable | readiness-insufficient | dealer-combat-c3 | 40% |
| 33 | 니키 | 글러브 (1) | 33:1 | 스증 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 41% |
| 34 | 나타폰 | 카메라 (23) | 34:23 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 35 | 얀 | 글러브 (1) | 35:1 | 평타 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 40% |
| 35 | 얀 | 통파 (2) | 35:2 | 스증 브루저 | no | provisional | provisional-or-ready | bruiser-combat-c3 | 41% |
| 36 | 이바 | 투척 (5) | 36:5 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 37 | 다니엘 | 단검 (15) | 37:15 | 암살자 | yes | unavailable | no-exact-baseline | assassin-combat-c3 | 48% |
| 38 | 제니 | 권총 (9) | 38:9 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 39 | 카밀로 | 쌍검 (18) | 39:18 | 평타 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 40% |
| 39 | 카밀로 | 레이피어 (21) | 39:21 | 평타 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 40% |
| 4 | 매그너스 | 망치 (13) | 4:13 | 탱커 | no | provisional | provisional-or-ready | tank-combat-fallback | 44% |
| 4 | 매그너스 | 방망이 (3) | 4:3 | 스증 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 41% |
| 40 | 클로에 | 암기 (6) | 40:6 | 평타 딜러 | yes | unavailable | no-exact-baseline | dealer-combat-c3 | 40% |
| 41 | 요한 | 아르카나 (24) | 41:24 | 서포터 | no | unusable | readiness-insufficient | support-healer-combat | 53% |
| 42 | 비앙카 | 아르카나 (24) | 42:24 | 스증 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 41% |
| 43 | 셀린 | 투척 (5) | 43:5 | 스증 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 42% |
| 44 | 에키온 | VF 보철 (25) | 44:25 | 평타 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 40% |
| 45 | 마이 | 채찍 (4) | 45:4 | 탱커 | no | ready | provisional-or-ready | tank-combat-fallback | 44% |
| 46 | 에이든 | 양손검 (16) | 46:16 | 평타 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 40% |
| 47 | 라우라 | 채찍 (4) | 47:4 | 암살자 | yes | experimental | readiness-insufficient | assassin-combat-c3 | 48% |
| 48 | 띠아 | 방망이 (3) | 48:3 | 스증 딜러 | yes | unavailable | no-exact-baseline | dealer-combat-c3 | 42% |
| 49 | 펠릭스 | 창 (19) | 49:19 | 평타 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 40% |
| 5 | 자히르 | 투척 (5) | 5:5 | 스증 딜러 | yes | unusable | readiness-insufficient | dealer-combat-c3 | 42% |
| 5 | 자히르 | 암기 (6) | 5:6 | 스증 딜러 | yes | unusable | readiness-insufficient | dealer-combat-c3 | 42% |
| 50 | 엘레나 | 레이피어 (21) | 50:21 | 탱커 | no | unusable | readiness-insufficient | tank-combat-fallback | 44% |
| 51 | 프리야 | 기타 (22) | 51:22 | 서포터 | no | ready | provisional-or-ready | support-utility-combat | 53% |
| 52 | 아디나 | 아르카나 (24) | 52:24 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 53 | 마커스 | 망치 (13) | 53:13 | 탱커 | no | unavailable | no-exact-baseline | tank-combat-fallback | 44% |
| 53 | 마커스 | 도끼 (14) | 53:14 | 평타 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 40% |
| 54 | 칼라 | 석궁 (8) | 54:8 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 55 | 에스텔 | 도끼 (14) | 55:14 | 탱커 | no | unusable | readiness-insufficient | tank-combat-fallback | 44% |
| 56 | 피올로 | 쌍절곤 (20) | 56:20 | 스증 브루저 | no | provisional | provisional-or-ready | bruiser-combat-c3 | 41% |
| 57 | 마르티나 | 카메라 (23) | 57:23 | 평타 딜러 | yes | unavailable | no-exact-baseline | dealer-combat-c3 | 40% |
| 58 | 헤이즈 | 돌격 소총 (10) | 58:10 | 스증 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 42% |
| 59 | 아이작 | 통파 (2) | 59:2 | 평타 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 40% |
| 6 | 나딘 | 활 (7) | 6:7 | 스증 딜러 | yes | unusable | readiness-insufficient | dealer-combat-c3 | 42% |
| 6 | 나딘 | 석궁 (8) | 6:8 | 평타 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 40% |
| 60 | 타지아 | 암기 (6) | 60:6 | 스증 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 42% |
| 61 | 이렘 | 투척 (5) | 61:5 | 스증 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 41% |
| 62 | 테오도르 | 저격총 (11) | 62:11 | 서포터 | no | unusable | readiness-insufficient | support-utility-combat | 53% |
| 63 | 이안 | 단검 (15) | 63:15 | 스증 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 41% |
| 64 | 바냐 | 아르카나 (24) | 64:24 | 스증 브루저 | no | provisional | provisional-or-ready | bruiser-combat-c3 | 41% |
| 65 | 데비&마를렌 | 양손검 (16) | 65:16 | 평타 브루저 | no | provisional | provisional-or-ready | bruiser-combat-c3 | 40% |
| 66 | 아르다 | 아르카나 (24) | 66:24 | 서포터 | no | ready | provisional-or-ready | support-utility-combat | 53% |
| 67 | 아비게일 | 도끼 (14) | 67:14 | 스증 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 41% |
| 68 | 알론소 | 글러브 (1) | 68:1 | 탱커 | no | experimental | readiness-insufficient | tank-combat-fallback | 44% |
| 69 | 레니 | 권총 (9) | 69:9 | 서포터 | no | ready | provisional-or-ready | support-utility-combat | 53% |
| 7 | 현우 | 글러브 (1) | 7:1 | 평타 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 40% |
| 7 | 현우 | 통파 (2) | 7:2 | 탱커 | no | unavailable | no-exact-baseline | tank-combat-fallback | 44% |
| 70 | 츠바메 | 암기 (6) | 70:6 | 평타 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 40% |
| 71 | 케네스 | 도끼 (14) | 71:14 | 스증 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 41% |
| 72 | 카티야 | 저격총 (11) | 72:11 | 평타 딜러 | yes | ready | provisional-or-ready | dealer-combat-c3 | 40% |
| 73 | 샬럿 | 아르카나 (24) | 73:24 | 서포터 | no | ready | provisional-or-ready | support-healer-combat | 53% |
| 74 | 다르코 | 방망이 (3) | 74:3 | 스증 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 41% |
| 75 | 르노어 | 기타 (22) | 75:22 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 76 | 가넷 | 방망이 (3) | 76:3 | 탱커 | no | provisional | provisional-or-ready | tank-combat-fallback | 44% |
| 77 | 유민 | 아르카나 (24) | 77:24 | 스증 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 42% |
| 78 | 히스이 | 양손검 (16) | 78:16 | 스증 브루저 | no | unusable | readiness-insufficient | bruiser-combat-c3 | 41% |
| 79 | 유스티나 | 석궁 (8) | 79:8 | 스증 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 42% |
| 8 | 하트 | 기타 (22) | 8:22 | 평타 딜러 | yes | unusable | readiness-insufficient | dealer-combat-c3 | 40% |
| 80 | 이슈트반 | 창 (19) | 80:19 | 스증 브루저 | no | provisional | provisional-or-ready | bruiser-combat-c3 | 41% |
| 81 | 니아 | 권총 (9) | 81:9 | 스증 딜러 | yes | experimental | readiness-insufficient | dealer-combat-c3 | 42% |
| 82 | 슈린 | 레이피어 (21) | 82:21 | 암살자 | yes | experimental | readiness-insufficient | assassin-combat-c3 | 48% |
| 83 | 헨리 | 암기 (6) | 83:6 | 스증 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 42% |
| 84 | 블레어 | 쌍검 (18) | 84:18 | 스증 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 41% |
| 85 | 미르카 | 망치 (13) | 85:13 | 탱커 | no | ready | provisional-or-ready | tank-combat-fallback | 44% |
| 86 | 펜리르 | 글러브 (1) | 86:1 | 스증 브루저 | no | unavailable | no-exact-baseline | bruiser-combat-c3 | 41% |
| 87 | 코렐라인 | 아르카나 (24) | 87:24 | 스증 딜러 | yes | unusable | readiness-insufficient | dealer-combat-c3 | 42% |
| 88 | 비형 | 방망이 (3) | 88:3 | 스증 브루저 | no | experimental | readiness-insufficient | bruiser-combat-c3 | 41% |
| 9 | 아이솔 | 돌격 소총 (10) | 9:10 | 평타 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 40% |
| 9 | 아이솔 | 권총 (9) | 9:9 | 스증 딜러 | yes | provisional | provisional-or-ready | dealer-combat-c3 | 42% |

Healer keys (numeric only):
- `41:24`
- `73:24`

