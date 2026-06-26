-- CreateTable
CREATE TABLE `player_season_backfill_states` (
    `id` VARCHAR(191) NOT NULL,
    `uid` VARCHAR(128) NOT NULL,
    `api_season_id` INTEGER NOT NULL,
    `display_season_id` INTEGER NULL,
    `status` VARCHAR(24) NOT NULL,
    `official_season_games` INTEGER NULL,
    `collected_games` INTEGER NOT NULL DEFAULT 0,
    `next_cursor` INTEGER NULL,
    `last_cursor` INTEGER NULL,
    `last_stopped_reason` VARCHAR(32) NULL,
    `last_error` VARCHAR(255) NULL,
    `pages_fetched_total` INTEGER NOT NULL DEFAULT 0,
    `raw_games_seen_total` INTEGER NOT NULL DEFAULT 0,
    `rank_games_seen_total` INTEGER NOT NULL DEFAULT 0,
    `upserted_total` INTEGER NOT NULL DEFAULT 0,
    `duplicate_total` INTEGER NOT NULL DEFAULT 0,
    `started_at` DATETIME(3) NULL,
    `last_run_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `retry_after` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `player_season_backfill_uid_season_idx`(`uid`, `api_season_id`),
    INDEX `player_season_backfill_status_retry_idx`(`status`, `retry_after`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
