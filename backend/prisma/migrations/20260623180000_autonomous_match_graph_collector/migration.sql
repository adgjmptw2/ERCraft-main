CREATE TABLE `collector_user_queue` (
  `user_num` BIGINT NOT NULL,
  `uid` VARCHAR(128) NULL,
  `last_known_nickname` VARCHAR(64) NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `priority` INTEGER NOT NULL DEFAULT 100,
  `discovery_depth` INTEGER NOT NULL DEFAULT 0,
  `discovered_from_game_id` VARCHAR(32) NULL,
  `last_collected_at` DATETIME(3) NULL,
  `next_collect_at` DATETIME(3) NULL,
  `page_cursor` INTEGER NULL,
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `lease_owner` VARCHAR(64) NULL,
  `lease_expires_at` DATETIME(3) NULL,
  `last_error_code` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`user_num`),
  INDEX `collector_user_queue_claim_idx` (`status`, `priority`, `next_collect_at`),
  INDEX `collector_user_queue_uid_idx` (`uid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `collector_game_queue` (
  `game_id` VARCHAR(32) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `priority` INTEGER NOT NULL DEFAULT 100,
  `discovered_from_user_num` BIGINT NULL,
  `season_id` INTEGER NULL,
  `matching_mode` INTEGER NULL,
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME(3) NULL,
  `lease_owner` VARCHAR(64) NULL,
  `lease_expires_at` DATETIME(3) NULL,
  `collected_at` DATETIME(3) NULL,
  `last_error_code` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`game_id`),
  INDEX `collector_game_queue_claim_idx` (`status`, `priority`, `next_attempt_at`),
  INDEX `collector_game_queue_discovered_user_idx` (`discovered_from_user_num`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `collector_api_usage` (
  `id` VARCHAR(191) NOT NULL,
  `date` DATE NOT NULL,
  `endpoint` VARCHAR(64) NOT NULL,
  `success_count` INTEGER NOT NULL DEFAULT 0,
  `failure_count` INTEGER NOT NULL DEFAULT 0,
  `rate_limited_count` INTEGER NOT NULL DEFAULT 0,
  `collector_request_count` INTEGER NOT NULL DEFAULT 0,
  `interactive_request_count` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `collector_api_usage_date_endpoint_key` (`date`, `endpoint`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
