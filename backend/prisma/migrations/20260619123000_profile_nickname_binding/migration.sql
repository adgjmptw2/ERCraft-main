-- CreateTable
CREATE TABLE `profile_nickname_bindings` (
    `normalized_nickname` VARCHAR(64) NOT NULL,
    `canonical_uid` VARCHAR(128) NOT NULL,
    `canonical_user_num` BIGINT NOT NULL,
    `verified_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL,

    INDEX `profile_nickname_binding_canonical_idx`(`canonical_uid`),
    PRIMARY KEY (`normalized_nickname`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
