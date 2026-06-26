-- CreateTable
CREATE TABLE `profile_identity_aliases` (
    `id` VARCHAR(191) NOT NULL,
    `canonical_uid` VARCHAR(128) NOT NULL,
    `source_uid` VARCHAR(128) NOT NULL,
    `verification_method` VARCHAR(32) NOT NULL,
    `fingerprint_hash` VARCHAR(64) NULL,
    `verified_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `profile_identity_alias_canonical_active_idx`(`canonical_uid`, `is_active`),
    INDEX `profile_identity_alias_source_idx`(`source_uid`),
    UNIQUE INDEX `profile_identity_alias_canonical_source_key`(`canonical_uid`, `source_uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
