-- CreateTable
CREATE TABLE `season_aggregate_cache` (
    `id` VARCHAR(191) NOT NULL,
    `uid` VARCHAR(191) NOT NULL,
    `user_num` BIGINT NOT NULL,
    `api_season_id` INTEGER NOT NULL,
    `display_season_id` INTEGER NOT NULL,
    `cache_status` VARCHAR(191) NOT NULL DEFAULT 'partial',
    `character_stats` JSON NOT NULL,
    `rp_series` JSON NOT NULL,
    `cached_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_refreshed_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NULL,

    UNIQUE INDEX `season_aggregate_cache_uid_api_season_id_key`(`uid`, `api_season_id`),
    INDEX `season_aggregate_cache_user_num_display_season_id_idx`(`user_num`, `display_season_id`),
    INDEX `season_aggregate_cache_status_expires_at_idx`(`cache_status`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
