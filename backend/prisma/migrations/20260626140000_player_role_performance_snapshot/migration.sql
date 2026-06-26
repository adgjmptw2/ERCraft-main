CREATE TABLE `player_role_performance_snapshots` (
  `id` VARCHAR(255) NOT NULL,
  `canonical_uid` VARCHAR(128) NOT NULL,
  `display_season_id` INTEGER NOT NULL,
  `api_season_id` INTEGER NOT NULL,
  `row_type` VARCHAR(16) NOT NULL,
  `primary_role` VARCHAR(32) NOT NULL,
  `benchmark_scope` VARCHAR(24) NOT NULL,
  `benchmark_version` VARCHAR(64) NOT NULL,
  `eligible_matches` INTEGER NOT NULL,
  `overall_score` DOUBLE NULL,
  `tier_band` VARCHAR(32) NULL,
  `metrics` JSON NULL,
  `source_fingerprint` VARCHAR(128) NOT NULL,
  `computed_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `prps_uid_season_row_scope_ver_key` (`canonical_uid`, `display_season_id`, `row_type`, `benchmark_scope`, `benchmark_version`),
  INDEX `prps_season_role_scope_idx` (`display_season_id`, `primary_role`, `benchmark_scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
