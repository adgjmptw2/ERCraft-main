-- CreateTable
CREATE TABLE `collector_identity_queue` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `source_game_id` VARCHAR(32) NOT NULL,
    `nickname` VARCHAR(64) NOT NULL,
    `character_num` INTEGER NOT NULL,
    `team_number` INTEGER NOT NULL DEFAULT 0,
    `season_id` INTEGER NULL,
    `matching_mode` INTEGER NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `priority` INTEGER NOT NULL DEFAULT 100,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NULL,
    `resolved_uid` VARCHAR(128) NULL,
    `resolved_user_num` BIGINT NULL,
    `verification_status` VARCHAR(32) NULL,
    `nickname_resolve_count` INTEGER NOT NULL DEFAULT 0,
    `verify_game_count` INTEGER NOT NULL DEFAULT 0,
    `total_request_count` INTEGER NOT NULL DEFAULT 0,
    `lease_owner` VARCHAR(64) NULL,
    `lease_expires_at` DATETIME(3) NULL,
    `last_error_code` VARCHAR(48) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `collector_identity_queue_identity_key`(`source_game_id`, `nickname`, `character_num`, `team_number`),
    INDEX `collector_identity_queue_claim_idx`(`status`, `priority`, `next_attempt_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
