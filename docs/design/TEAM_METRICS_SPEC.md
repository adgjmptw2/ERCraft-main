# Team Metrics Spec

## Principle

Team-related metrics must stay separate from personal performance grades.

This is not matchmaking luck:

```text
myMatchGrade - teammateAverageMatchGrade
```

Better names for that value:

- 캐리 부담도
- 팀 내 성과 격차
- 개인 기여 우위

Team experience should be split into three different concepts.

## A. Matchmaking Luck

Matchmaking luck uses only information knowable before the match result. The player's own information is excluded from teammate strength calculations.

```text
teammateExpectedStrength =
  average(pre-match expected strength of my teammates)

lobbyExpectedStrength =
  average(pre-match expected strength of other players)

matchmakingLuck =
  teammateExpectedStrength relative to lobbyExpectedStrength
```

Candidate inputs:

- RP/MMR at match time
- tier bucket at match time
- recent form before the match
- role composition fit
- party status
- character proficiency before the match
- only values available at matchmaking time

Do not use final placement, damage, kills, or post-match grade. Do not include my RP or my grade. Otherwise, a strong player would incorrectly make the team look lucky.

## B. Teammate Execution

Teammate execution measures whether teammates performed above or below their own pre-match expectations.

```text
teammateExecutionResidual =
  actual teammate match performance
- expected teammate match performance
```

Use the mean or robust mean of teammate residuals.

Candidate inputs:

- teammate actual match performanceScore
- expected score from teammate tier, character, role, and recent form
- robust handling for early exits and extreme values

Display name candidates:

- 팀원 수행도
- 팀원 기대 대비 성과

This is match execution, not matchmaking luck.

## C. Carry Burden

Carry burden shows the gap between my actual performance and teammate actual performance.

```text
carryBurden =
  myMatchPerformanceScore
- average(teammateMatchPerformanceScore)
```

High carry burden means I carried a larger share of team performance. It must not be named team luck.

## Summary Display

Prefer showing the three metrics separately:

- 매칭 팀운
- 팀원 수행도
- 캐리 부담도

If a single summary is required later, evaluate:

```text
Team Experience Index =
  Matchmaking Luck * 60%
+ Teammate Execution * 40%
```

Carry burden should not be included in the team-luck summary because it depends on my own performance.

If one input is missing, do not redistribute its weight to 100%. Show the partial metric or mark the summary unavailable.

## Bands

When true benchmark percentiles are available:

- 매우 불리
- 불리
- 보통
- 유리
- 매우 유리

Bands must be calibrated against real lobby distributions, not fixed RP deltas.

## Data Availability Audit

Current data must be verified before implementation:

- teammate RP at match time: unknown, requires match detail/participant data audit
- opponent RP at match time: unknown
- teammate recent form before match: not currently materialized as pre-match snapshot
- party status: unknown
- character proficiency at match time: not currently materialized
- full lobby identity: partially available only when match detail participants are stored
- team composition: available when match detail participants are stored

Do not display estimates as facts.

## MVP

If pre-match strength data is unavailable, provide only:

- 팀원 수행도
- 캐리 부담도

Do not call these metrics team luck.

## Full Version

After pre-match data is available:

- 매칭 팀운
- 팀원 수행도
- 캐리 부담도

All three should include confidence, sample count, missing-data metadata, and benchmark version.

## Non-Goals

- Do not mix team metrics into player grade.
- Do not implement team luck in the current step.
- Do not add API or UI fields until data availability is verified.
