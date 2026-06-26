-- 39.42 role snapshot unique key includes primaryRole (one sample per role per user/window/scope)
DROP INDEX `prps_uid_season_row_scope_ver_key` ON `player_role_performance_snapshots`;

CREATE UNIQUE INDEX `prps_uid_season_role_row_scope_ver_key` ON `player_role_performance_snapshots`(
  `canonical_uid`,
  `display_season_id`,
  `primary_role`,
  `row_type`,
  `benchmark_scope`,
  `benchmark_version`
);
