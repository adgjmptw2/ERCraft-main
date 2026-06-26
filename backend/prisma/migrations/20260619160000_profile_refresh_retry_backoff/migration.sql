ALTER TABLE `player_profile_refresh_states`
ADD COLUMN `last_failed_at` DATETIME(3) NULL,
ADD COLUMN `next_retry_at` DATETIME(3) NULL;
