-- CreateTable
CREATE TABLE `season_stats_cache` (
    `id` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `is_current` BOOLEAN NOT NULL DEFAULT false,
    `cached_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,

    INDEX `season_stats_cache_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
