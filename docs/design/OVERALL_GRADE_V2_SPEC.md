# Overall Grade V2 Spec

## Purpose

Overall Grade V2 should measure one player's season-level performance against a player-season benchmark cohort. It must not replace the current production grade until the benchmark artifact, validation, migration, and UI wording are ready.

## Current Model

Current overall grade:

```text
Overall = sum(character.gradeScore * character.matchCount) / sum(graded character.matchCount)
```

Known limitations:

- Character scores are already normalized, then averaged again.
- Main characters dominate the denominator.
- Ungraded matches are excluded.
- Character-level sample confidence affects the overall score.
- The benchmark unit is not a player-season row.
- The score is not an empirical percentile.

## Recommended Benchmark Unit

Use one row per player, season, mode, tier cohort, and primary role cohort.

```text
playerSeasonBenchmarkKey =
  seasonId + mode + tierBucket + primaryRole
```

One player with hundreds of matches should contribute one benchmark row, not hundreds of match rows. Match count belongs in reliability metadata, not in benchmark row multiplicity.

## Candidate Score

```text
Overall V2 =
  Outcome Performance * 30%
+ Role Performance    * 50%
+ Consistency         * 20%
```

Weights are candidate defaults and require offline validation before product use.

## Outcome Performance 30%

Candidate metrics:

- winRate
- top2Rate
- top3Rate
- averagePlacement
- bottomPlacementRate

Each metric should be converted to a relative score against the same player-season cohort.

## Role Performance 50%

Reuse the current C3 role preset families as the initial role taxonomy:

- 평타 딜러
- 스증 딜러
- 암살자
- 평타 브루저
- 스증 브루저
- 탱커
- 서포터

Each player-season should resolve a primary role from match-weighted character/weapon usage. Role metrics must compare against the same season, mode, tier bucket, and role cohort.

## Consistency 20%

Consistency must avoid rewarding only one or two peak games.

Candidate metrics:

- median match performance score
- lower quartile match performance score
- score volatility
- bad-game rate
- stable-high-performance rate

Do not use simple average alone.

## Confidence Separation

Do not multiply match count into the performance score.

Expose separately:

- performanceScore
- reliability/confidence
- sampleCount
- minimumSampleStatus

Below the minimum sample threshold, show `표본 부족` instead of automatically lowering performance.

## Character Diversity

Do not give bonus points for playing many characters. Do not penalize one-character or small-pool players. Character diversity can be a descriptive insight, not a grade input.

## Fallback Order

1. Same season + mode + tier + primary role
2. Same season + mode + adjacent tier + primary role
3. Same season + mode + all tiers + primary role
4. Current character-grade weighted average as legacy fallback
5. Unavailable

Missing metric weights must not be automatically redistributed. If required metrics are missing, mark the partial section unavailable or lower confidence.

## Output Metadata

V2 response metadata should include:

- overallPerformanceScore
- overallGrade
- actualPercentile, only if a true empirical percentile exists
- benchmarkKey
- benchmarkSampleCount
- fallbackLevel
- confidence
- metricContributions
- version

## Migration Plan

1. Build offline player-season benchmark artifact.
2. Run shadow reports for known users and anonymized cohorts.
3. Compare against current legacy overall grade.
4. Add API metadata behind a non-UI flag.
5. Add UI copy that distinguishes performance score, confidence, and percentile.
6. Keep current overall grade as legacy fallback until V2 has stable coverage.

## Non-Goals

- Do not generate player-season benchmark artifacts in the current step.
- Do not replace the production overall grade.
- Do not call the V2 score a percentile unless percentile calibration exists.
