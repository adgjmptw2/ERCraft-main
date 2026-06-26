# Overall Grade V2 Shadow Result

Generated at: 2026-06-21T04:35:25.492Z

This is a shadow-only design result. It is not wired to production API, UI, snapshots, or the current overall grade.

## Verdict

보류. 현재 `player_matches` corpus는 검색 사용자 중심이고, cohort fallback 비율이 높아 production 연결 전 추가 데이터와 threshold 재설계가 필요하다.

## Formula

```text
Overall V2 = Outcome Performance 30% + Role Performance 50% + Consistency 20%
```

- Outcome: top3Rate 45%, averagePlacement 35%, bottomRate 20%.
- Role: 기존 `ROLE_PRESET_WEIGHTS`를 primary role에 그대로 적용.
- Consistency: median stability 35%, lower-tail protection 35%, volatility control 15%, C-or-lower protection 15%.

## Dataset

- Source: `experimental-player-matches-shadow`
- Rows: 264
- Unique players: 264
- Matches: 33740
- Modes: rank only
- Excluded: cobalt, normal, union
- Source hash: `140b2c49eb9a914561fcee017f55b76612594bbda5b1ab3210a361719953b37f`

## Distribution

- Overall V2 mean: 50.34
- Median: 52.08
- p10/p90/p95: 28.78 / 70.21 / 77.84
- Confidence: `{"high":124,"insufficient":1,"low":8,"medium":131}`
- Fallback: `{"adjacent-tier":2,"all-tier-role":5,"exact":241,"tier-all-role":15,"unavailable":1}`

## Target Notes

- 연서: current 61.5 / V2 60.35 / LOO 60.58
- 아드마이할게요: current 75.36 / V2 41.52 / LOO 41.22
- gapri: current 85.14 / V2 42.76 / LOO 42.27

## Risk

- 현재 artifact는 production benchmark가 아니다.
- 실제 percentile은 cohort 표본이 충분한 경우에만 채웠다.
- missing component는 자동 가중치 재분배하지 않았다.
- 팀운, 매칭 운, 팀원 수행도는 구현하지 않았다.
