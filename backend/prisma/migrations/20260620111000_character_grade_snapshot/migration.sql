CREATE TABLE `character_grade_snapshots` (
  `id` VARCHAR(255) NOT NULL,
  `uid` VARCHAR(128) NOT NULL,
  `canonical_user_num` BIGINT NOT NULL,
  `api_season_id` INTEGER NOT NULL,
  `display_season_id` INTEGER NOT NULL,
  `match_mode` VARCHAR(24) NOT NULL,
  `benchmark_version` VARCHAR(64) NOT NULL,
  `metric_preset_version` VARCHAR(64) NOT NULL,
  `source_fingerprint` VARCHAR(128) NOT NULL,
  `status` VARCHAR(24) NOT NULL,
  `character_stats` JSON NOT NULL,
  `metadata` JSON NULL,
  `computed_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `character_grade_snapshot_user_season_mode_idx` (`canonical_user_num`, `display_season_id`, `match_mode`),
  INDEX `character_grade_snapshot_uid_api_mode_idx` (`uid`, `api_season_id`, `match_mode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
