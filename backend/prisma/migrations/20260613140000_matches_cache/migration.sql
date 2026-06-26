-- CreateTable
CREATE TABLE `matches_cache` (
    `id` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `next` INTEGER NULL,
    `cached_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `matches_cache_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
