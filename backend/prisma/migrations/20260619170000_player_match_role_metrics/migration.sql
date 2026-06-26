-- AlterTable
ALTER TABLE `player_matches`
  ADD COLUMN `damage_from_player` INTEGER NULL,
  ADD COLUMN `protect_absorb` INTEGER NULL,
  ADD COLUMN `shield_damage_offset_from_player` INTEGER NULL,
  ADD COLUMN `team_recover` INTEGER NULL,
  ADD COLUMN `cc_time_to_player` DOUBLE NULL,
  ADD COLUMN `view_contribution` DOUBLE NULL,
  ADD COLUMN `monster_kill` INTEGER NULL,
  ADD COLUMN `role_metrics_version` INTEGER NULL,
  ADD COLUMN `role_metrics_captured_at` DATETIME(3) NULL;

CREATE INDEX `player_match_role_metrics_version_idx` ON `player_matches`(`role_metrics_version`);
